import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestContext, seedChannel, type TestContext } from './harness.js';
import { buildApp } from '../http/app.js';
import { signPayload } from '../shared/crypto.js';
import { handleTelegramCommand } from '../http/routes/webhooks.js';

let ctx: TestContext;
let app: FastifyInstance;

beforeEach(async () => {
  ctx = await createTestContext();
  app = await buildApp(ctx.services);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await ctx.cleanup();
});

/** Registers a user through the API and returns its session cookie. */
async function register(email = 'api-user@example.test') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password: 'a-long-enough-password' },
  });
  expect(response.statusCode).toBe(201);
  const cookie = response.cookies.find((c) => c.name === ctx.config.security.sessionCookie);
  expect(cookie).toBeTruthy();
  return { cookie: `${cookie!.name}=${cookie!.value}`, user: response.json().user };
}

describe('authentication', () => {
  it('registers, authenticates and logs out', async () => {
    const { cookie, user } = await register();
    expect(user.role).toBe('ADMIN'); // first account owns the instance

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe('api-user@example.test');

    const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(logout.statusCode).toBe(200);

    const after = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(after.statusCode).toBe(401);
  });

  it('refuses anonymous access to protected routes', async () => {
    for (const url of ['/api/auth/me', '/api/channels', '/api/providers', '/api/templates']) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
    }
  });

  it('rejects a wrong password and an unknown account identically', async () => {
    await register('real@example.test');
    const wrong = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { email: 'real@example.test', password: 'not-the-password' },
    });
    const unknown = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { email: 'nobody@example.test', password: 'not-the-password' },
    });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json().error.message).toBe(unknown.json().error.message);
  });

  it('validates the request body', async () => {
    const response = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 'not-an-email', password: 'short' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('validation_error');
  });

  it('revokes every session when the password changes', async () => {
    const { cookie } = await register();
    const change = await app.inject({
      method: 'POST', url: '/api/auth/password', headers: { cookie },
      payload: { currentPassword: 'a-long-enough-password', newPassword: 'a-different-long-password' },
    });
    expect(change.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).statusCode).toBe(401);
  });
});

describe('tenant isolation', () => {
  it('hides another user\'s channel behind a 404', async () => {
    const owner = await register('owner@example.test');
    const created = await app.inject({
      method: 'POST', url: '/api/channels', headers: { cookie: owner.cookie },
      payload: {
        name: 'Owned', settings: { niche: 'history', targetAudience: 'curious adults' },
      },
    });
    expect(created.statusCode).toBe(201);
    const channelId = created.json().channel.id;

    const intruder = await register('intruder@example.test');
    for (const url of [`/api/channels/${channelId}`, `/api/ideas?channelId=${channelId}`, `/api/overview?channelId=${channelId}`]) {
      const response = await app.inject({ method: 'GET', url, headers: { cookie: intruder.cookie } });
      expect(response.statusCode).toBe(404);
    }
  });

  it('keeps admin-only routes closed to ordinary users', async () => {
    await register('first@example.test'); // becomes ADMIN
    const second = await register('second@example.test');
    const response = await app.inject({ method: 'GET', url: '/api/admin/stats', headers: { cookie: second.cookie } });
    expect(response.statusCode).toBe(403);
  });
});

describe('CSRF and security headers', () => {
  it('rejects unsafe requests from another origin', async () => {
    const { cookie } = await register();
    const response = await app.inject({
      method: 'POST', url: '/api/channels',
      headers: { cookie, origin: 'https://evil.example' },
      payload: { name: 'x', settings: { niche: 'x', targetAudience: 'y' } },
    });
    expect(response.statusCode).toBe(403);
  });

  it('allows the configured application origin', async () => {
    const { cookie } = await register();
    const response = await app.inject({
      method: 'POST', url: '/api/channels',
      headers: { cookie, origin: ctx.config.http.appUrl },
      payload: { name: 'Allowed', settings: { niche: 'history', targetAudience: 'adults' } },
    });
    expect(response.statusCode).toBe(201);
  });

  it('sets the documented security headers', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
  });
});

describe('channels', () => {
  it('creates a channel with defaults, sources and rules', async () => {
    const { cookie } = await register();
    const created = await app.inject({
      method: 'POST', url: '/api/channels', headers: { cookie },
      payload: {
        name: 'My History Channel',
        settings: { niche: 'European history', targetAudience: 'curious adults', videosPerWeek: 3, targetDurationMin: 12 },
      },
    });
    expect(created.statusCode).toBe(201);
    const { channel, settings } = created.json();
    expect(settings.videosPerWeek).toBe(3);
    expect(settings.automationMode).toBe('SEMI_AUTO');

    const detail = await app.inject({ method: 'GET', url: `/api/channels/${channel.id}`, headers: { cookie } });
    const body = detail.json();
    expect(body.connected).toBe(false);
    expect(body.sources.length).toBeGreaterThan(0);
    expect(body.rules.length).toBeGreaterThan(0);
    expect(body.upcomingSlots.length).toBeGreaterThan(0);
    expect(body.budget.level).toBe('ok');
  });

  it('updates settings and reflects them in the schedule', async () => {
    const seeded = await seedChannel(ctx);
    const { cookie } = await loginAs(seeded.user.email);

    const patched = await app.inject({
      method: 'PATCH', url: `/api/channels/${seeded.channel.id}`, headers: { cookie },
      payload: { settings: { publishDays: [2], defaultPublishTime: '09:30', timezone: 'UTC' } },
    });
    expect(patched.statusCode).toBe(200);

    const schedule = await app.inject({
      method: 'GET', url: `/api/channels/${seeded.channel.id}/schedule?count=3`, headers: { cookie },
    });
    const slots = schedule.json().slots as Array<{ publishAt: string }>;
    expect(slots).toHaveLength(3);
    for (const slot of slots) {
      const date = new Date(slot.publishAt);
      expect(date.getUTCDay()).toBe(2);
      expect(date.getUTCHours()).toBe(9);
      expect(date.getUTCMinutes()).toBe(30);
    }
  });

  it('reports an actionable error when OAuth is not configured', async () => {
    const seeded = await seedChannel(ctx);
    const { cookie } = await loginAs(seeded.user.email);

    // Offline mode registers a mock provider that reports itself configured, so force the
    // unconfigured path to prove the message the user would actually get.
    const provider = ctx.services.registry.publishing()!;
    Object.defineProperty(provider, 'isConfigured', { value: () => false });
    Object.defineProperty(provider, 'missingConfig', { value: () => ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'] });

    const response = await app.inject({
      method: 'POST', url: `/api/channels/${seeded.channel.id}/connect`, headers: { cookie },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.message).toContain('YOUTUBE_CLIENT_ID');
  });

  it('issues a signed OAuth authorize URL', async () => {
    const seeded = await seedChannel(ctx);
    const { cookie } = await loginAs(seeded.user.email);
    const response = await app.inject({
      method: 'POST', url: `/api/channels/${seeded.channel.id}/connect`, headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const { authorizeUrl, state } = response.json();
    expect(authorizeUrl).toContain(encodeURIComponent(state));
    expect(state.split('.')[0]).toBe(seeded.channel.id);
  });

  it('refuses autopilot until the channel is connected', async () => {
    const seeded = await seedChannel(ctx);
    const { cookie } = await loginAs(seeded.user.email);
    const response = await app.inject({
      method: 'POST', url: `/api/channels/${seeded.channel.id}/autopilot`, headers: { cookie },
      payload: { enabled: true },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.message).toContain('Connect the channel');
  });

  it('adds and removes competitors and sources', async () => {
    const seeded = await seedChannel(ctx);
    const { cookie } = await loginAs(seeded.user.email);

    const competitor = await app.inject({
      method: 'POST', url: `/api/channels/${seeded.channel.id}/competitors`, headers: { cookie },
      payload: { youtubeChannelId: 'UCcompetitor00000000001' },
    });
    expect(competitor.statusCode).toBe(201);
    expect(competitor.json().competitor.name.length).toBeGreaterThan(0);

    const source = await app.inject({
      method: 'POST', url: `/api/channels/${seeded.channel.id}/sources`, headers: { cookie },
      payload: { kind: 'RSS', label: 'A feed', target: 'https://example.org/feed.xml' },
    });
    expect(source.statusCode).toBe(201);

    const bad = await app.inject({
      method: 'POST', url: `/api/channels/${seeded.channel.id}/sources`, headers: { cookie },
      payload: { kind: 'RSS', label: 'Bad', target: 'not-a-url' },
    });
    expect(bad.statusCode).toBe(400);

    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/channels/${seeded.channel.id}/competitors/${competitor.json().competitor.id}`,
      headers: { cookie },
    });
    expect(removed.statusCode).toBe(200);
  });
});

describe('ideas and production', () => {
  it('generates, scores, approves and produces', async () => {
    const seeded = await seedChannel(ctx, { automationMode: 'SEMI_AUTO' });
    const { cookie } = await loginAs(seeded.user.email);

    const generated = await app.inject({
      method: 'POST', url: '/api/ideas/generate', headers: { cookie },
      payload: { channelId: seeded.channel.id, count: 3 },
    });
    expect(generated.statusCode).toBe(200);
    const ideas = generated.json().ideas as Array<{ id: string; overallScore: number; status: string }>;
    expect(ideas.length).toBeGreaterThan(0);
    expect(ideas.every((i) => i.status === 'PROPOSED')).toBe(true);
    expect(ideas.every((i) => i.overallScore > 0)).toBe(true);

    const approved = await app.inject({
      method: 'POST', url: `/api/ideas/${ideas[0]!.id}/approve`, headers: { cookie },
    });
    expect(approved.json().idea.status).toBe('APPROVED');

    const produced = await app.inject({
      method: 'POST', url: `/api/ideas/${ideas[0]!.id}/produce`, headers: { cookie }, payload: {},
    });
    expect(produced.statusCode).toBe(201);
    const { video, jobId, reason } = produced.json();
    expect(video.status).toBe('IDEA');
    expect(jobId).toBeTruthy();
    expect(reason).toContain('score');

    // The HTTP request enqueued work rather than doing it (spec §69).
    const jobs = await ctx.repos.jobs.listByVideo(video.id);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.state).toBe('QUEUED');
  }, 60_000);

  it('blocks generation when the budget is exhausted', async () => {
    const seeded = await seedChannel(ctx, { monthlyBudgetUsd: 1 });
    const { cookie } = await loginAs(seeded.user.email);
    await ctx.repos.usage.record({
      channelId: seeded.channel.id, videoId: null, jobId: null,
      provider: 'mock', operation: 'test', model: null,
      inputUnits: 0, outputUnits: 0, unit: 'request',
      estimatedCost: 5, actualCost: 5, latencyMs: 1, status: 'ok', error: null,
    });

    const response = await app.inject({
      method: 'POST', url: '/api/ideas/generate', headers: { cookie },
      payload: { channelId: seeded.channel.id, count: 2 },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.message).toContain('budget');
  });

  it('refuses to schedule a video that has not passed QC', async () => {
    const seeded = await seedChannel(ctx);
    const { cookie } = await loginAs(seeded.user.email);
    const video = await ctx.repos.videos.create({
      channelId: seeded.channel.id, ideaId: null, templateId: null, title: 'Unchecked',
      status: 'READY', previousStatus: null, progress: {}, targetDurationSec: 300,
      actualDurationSec: null, language: 'en', renderKey: null, renderWidth: null, renderHeight: null,
      fileSizeBytes: null, qualityScore: null, qualityBreakdown: null, factConfidence: null,
      retentionScore: null, estimatedCostUsd: 0, actualCostUsd: 0, failureReason: null,
      publishAt: null, publishedAt: null, youtubeVideoId: null,
    });

    const response = await app.inject({
      method: 'POST', url: `/api/videos/${video.id}/schedule`, headers: { cookie }, payload: {},
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.message).toContain('quality control');
  });

  it('rejects a publish time in the past', async () => {
    const seeded = await seedChannel(ctx);
    const { cookie } = await loginAs(seeded.user.email);
    const video = await ctx.repos.videos.create({
      channelId: seeded.channel.id, ideaId: null, templateId: null, title: 'Checked',
      status: 'READY', previousStatus: null, progress: {}, targetDurationSec: 300,
      actualDurationSec: null, language: 'en', renderKey: null, renderWidth: null, renderHeight: null,
      fileSizeBytes: null, qualityScore: null, qualityBreakdown: null, factConfidence: null,
      retentionScore: null, estimatedCostUsd: 0, actualCostUsd: 0, failureReason: null,
      publishAt: null, publishedAt: null, youtubeVideoId: null,
    });
    await ctx.repos.qc.create({ videoId: video.id, passed: true, score: 90, checks: [], failures: [], repairs: [] });

    const response = await app.inject({
      method: 'POST', url: `/api/videos/${video.id}/schedule`, headers: { cookie },
      payload: { publishAt: new Date(ctx.clock.now().getTime() - 60_000).toISOString() },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('dashboard, costs and providers', () => {
  it('returns an overview with pipeline, budget and slots', async () => {
    const seeded = await seedChannel(ctx);
    const { cookie } = await loginAs(seeded.user.email);
    const response = await app.inject({
      method: 'GET', url: `/api/overview?channelId=${seeded.channel.id}`, headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.channel.id).toBe(seeded.channel.id);
    expect(body.budget).toBeTruthy();
    expect(body.pipeline.buffer).toBeTruthy();
    expect(body.upcomingSlots.length).toBeGreaterThan(0);
    expect(body.metrics).toHaveProperty('views');
  });

  it('reports costs by provider and per video', async () => {
    const seeded = await seedChannel(ctx);
    const { cookie } = await loginAs(seeded.user.email);
    await ctx.repos.usage.record({
      channelId: seeded.channel.id, videoId: null, jobId: null,
      provider: 'anthropic', operation: 'agent:SCRIPT_AGENT', model: 'claude',
      inputUnits: 1000, outputUnits: 500, unit: 'token',
      estimatedCost: 0.02, actualCost: 0.019, latencyMs: 900, status: 'ok', error: null,
    });

    const response = await app.inject({
      method: 'GET', url: `/api/costs?channelId=${seeded.channel.id}`, headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.total).toBeCloseTo(0.019, 4);
    expect(body.byProvider[0].provider).toBe('anthropic');
    expect(body.channels[0].budget.spentUsd).toBeCloseTo(0.019, 4);
    expect(body.recent.length).toBe(1);
  });

  it('reports provider configuration honestly', async () => {
    const { cookie } = await register();
    const response = await app.inject({ method: 'GET', url: '/api/providers', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.offline).toBe(true);
    expect(body.ffmpeg).toBeTypeOf('boolean');
    for (const provider of body.providers) {
      expect(provider).toHaveProperty('configured');
      expect(provider).toHaveProperty('missingEnv');
    }
  });

  it('exposes the prompt library with versions and stats', async () => {
    const { cookie } = await register();
    const list = await app.inject({ method: 'GET', url: '/api/prompts', headers: { cookie } });
    expect(list.statusCode).toBe(200);
    const prompts = list.json().prompts as Array<{ name: string; versions: unknown[] }>;
    expect(prompts.length).toBeGreaterThan(10);

    const created = await app.inject({
      method: 'POST', url: '/api/prompts/SCRIPT_AGENT/versions', headers: { cookie },
      payload: {
        systemPrompt: 'A revised system prompt long enough to pass validation checks.',
        userTemplate: 'Write about {{topic}} for {{audience}}.',
        notes: 'shorter',
        activate: true,
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().prompt.version).toBe(2);
    expect(created.json().prompt.variables).toEqual(expect.arrayContaining(['topic', 'audience']));

    const resolved = await ctx.services.prompts.resolve('SCRIPT_AGENT', { topic: 'Rome', audience: 'adults' });
    expect(resolved.version).toBe(2);
    expect(resolved.userPrompt).toBe('Write about Rome for adults.');
  });
});

describe('webhooks', () => {
  it('rejects an unsigned trigger and accepts a signed one', async () => {
    const seeded = await seedChannel(ctx);
    const payload = JSON.stringify({ action: 'publish-due' });

    const unsigned = await app.inject({
      method: 'POST', url: '/api/webhooks/trigger',
      headers: { 'content-type': 'application/json' }, payload,
    });
    expect(unsigned.statusCode).toBe(403);

    const timestamp = Math.floor(ctx.clock.now().getTime() / 1000);
    const signed = await app.inject({
      method: 'POST', url: '/api/webhooks/trigger',
      headers: {
        'content-type': 'application/json',
        'x-ycf-timestamp': String(timestamp),
        'x-ycf-signature': signPayload(ctx.config.security.webhookSecret, payload, timestamp),
      },
      payload,
    });
    expect(signed.statusCode).toBe(200);
    expect(signed.json()).toHaveProperty('queued');
    expect(seeded.channel.id).toBeTruthy();
  });

  it('rejects a replayed signature', async () => {
    const payload = JSON.stringify({ action: 'publish-due' });
    const stale = Math.floor(ctx.clock.now().getTime() / 1000) - 10_000;
    const response = await app.inject({
      method: 'POST', url: '/api/webhooks/trigger',
      headers: {
        'content-type': 'application/json',
        'x-ycf-timestamp': String(stale),
        'x-ycf-signature': signPayload(ctx.config.security.webhookSecret, payload, stale),
      },
      payload,
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('telegram bot', () => {
  it('refuses to answer an unlinked chat and serves a linked one', async () => {
    const seeded = await seedChannel(ctx);

    const unlinked = await handleTelegramCommand(ctx.services, '99999', '/status');
    expect(unlinked).toContain('not linked');

    await ctx.repos.notifications.create({
      userId: seeded.user.id, kind: 'telegram', target: '12345', events: [], enabled: true,
    });

    const status = await handleTelegramCommand(ctx.services, '12345', '/status');
    expect(status).toContain(seeded.channel.name);

    const cost = await handleTelegramCommand(ctx.services, '12345', '/cost');
    expect(cost).toContain('this month');

    const help = await handleTelegramCommand(ctx.services, '12345', '/unknown');
    expect(help).toContain('/status');
  });

  it('approves an idea through a command', async () => {
    const seeded = await seedChannel(ctx);
    await ctx.repos.notifications.create({
      userId: seeded.user.id, kind: 'telegram', target: '12345', events: [], enabled: true,
    });
    const [idea] = await ctx.repos.ideas.createMany([
      {
        channelId: seeded.channel.id, title: 'A candidate', topic: 't', angle: 'a', hook: 'h',
        targetAudience: 'x', rationale: null, status: 'PROPOSED',
        estimatedDemand: 80, competition: 30, novelty: 70, evergreenScore: 70, trendScore: 70,
        productionCostUsd: 1, estimatedCtr: 70, estimatedRetention: 70, overallScore: 75,
        scoreBreakdown: null, sourceSignals: null,
      },
    ]);

    const reply = await handleTelegramCommand(ctx.services, '12345', `/approve ${idea!.id}`);
    expect(reply).toContain('Approved');
    expect((await ctx.repos.ideas.findById(idea!.id))?.status).toBe('APPROVED');
  });
});

describe('health and meta', () => {
  it('answers without authentication', async () => {
    const health = await app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json().ok).toBe(true);

    const meta = await app.inject({ method: 'GET', url: '/api/meta' });
    expect(meta.json().stages.length).toBeGreaterThan(10);
  });

  it('returns a structured 404', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/does-not-exist' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('not_found');
  });
});

async function loginAs(email: string) {
  const response = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { email, password: 'test-password-1234' },
  });
  expect(response.statusCode).toBe(200);
  const cookie = response.cookies.find((c) => c.name === ctx.config.security.sessionCookie)!;
  return { cookie: `${cookie.name}=${cookie.value}` };
}

describe('rate limiting', () => {
  it('caps credential attempts without capping ordinary navigation', async () => {
    const { cookie } = await register('limits@example.test');

    // A page load calls /api/auth/me. Twenty navigations in a minute is normal use and
    // must not sign the user out (the strict cap belongs on login, not on the session read).
    for (let i = 0; i < 20; i += 1) {
      const response = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
      expect(response.statusCode).toBe(200);
    }

    // Login, by contrast, is capped hard.
    const attempts: number[] = [];
    for (let i = 0; i < 14; i += 1) {
      const response = await app.inject({
        method: 'POST', url: '/api/auth/login',
        payload: { email: 'limits@example.test', password: 'wrong-password-here' },
      });
      attempts.push(response.statusCode);
    }
    expect(attempts).toContain(429);
    expect(attempts.filter((code) => code === 429).length).toBeGreaterThan(1);
  });
});
