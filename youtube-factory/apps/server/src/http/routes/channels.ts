import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../../services/container.js';
import { requireChannel, requireUser } from '../middleware/auth.js';
import { AesGcmEncryptor, signPayload, verifySignature } from '../../shared/crypto.js';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../shared/errors.js';
import { AUTOMATION_MODES, SOURCE_KINDS } from '../../shared/types.js';
import { defaultSourcesFor } from '../../services/discovery.js';
import { RulesEngine } from '../../services/rules.js';
import { computeSlots } from '../../services/scheduler.js';

const settingsSchema = z.object({
  niche: z.string().min(2).max(200),
  language: z.string().min(2).max(10).default('en'),
  targetAudience: z.string().min(2).max(300),
  contentStyle: z.string().max(100).default('documentary'),
  targetDurationMin: z.number().int().min(1).max(120).default(10),
  videosPerWeek: z.number().int().min(1).max(21).default(3),
  automationMode: z.enum(AUTOMATION_MODES).default('SEMI_AUTO'),
  autopilotEnabled: z.boolean().default(false),
  autopilotRunAt: z.string().regex(/^\d{1,2}:\d{2}$/).default('06:00'),
  timezone: z.string().max(60).default('UTC'),
  defaultPublishTime: z.string().regex(/^\d{1,2}:\d{2}$/).default('18:00'),
  publishDays: z.array(z.number().int().min(0).max(6)).min(1).default([1, 3, 5]),
  privacyStatus: z.enum(['private', 'unlisted', 'public']).default('private'),
  voiceProviderId: z.string().max(60).nullable().optional(),
  voiceId: z.string().max(120).nullable().optional(),
  voiceSettings: z.record(z.unknown()).nullable().optional(),
  visualStyle: z.string().max(300).default('cinematic documentary'),
  thumbnailStyle: z.string().max(300).default('high-contrast subject with a three-word overlay'),
  musicMood: z.string().max(100).default('neutral cinematic'),
  monthlyBudgetUsd: z.number().min(0).max(100_000).default(100),
  minIdeaScore: z.number().min(0).max(100).default(70),
  minQcScore: z.number().min(0).max(100).default(75),
  minFactConfidence: z.number().min(0).max(1).default(0.85),
  minRetentionScore: z.number().min(0).max(100).default(70),
  maxCostPerVideoUsd: z.number().min(0).max(10_000).default(15),
  ideaWeights: z.record(z.number()).nullable().optional(),
  bufferTargetVideos: z.number().int().min(0).max(20).default(2),
});

export async function channelRoutes(app: FastifyInstance, services: AppServices): Promise<void> {
  app.get('/api/channels', async (request) => {
    const user = requireUser(request);
    const channels = await services.repos.channels.listByUser(user.id);
    return {
      channels: await Promise.all(
        channels.map(async (channel) => ({
          ...channel,
          settings: await services.repos.channelSettings.findByChannel(channel.id),
          connected: Boolean(await services.repos.oauth.findByChannel(channel.id)),
        })),
      ),
    };
  });

  app.post('/api/channels', async (request, reply) => {
    const user = requireUser(request);
    const body = z
      .object({ name: z.string().min(1).max(120), settings: settingsSchema })
      .parse(request.body);

    const existing = await services.repos.channels.listByUser(user.id);
    const channel = await services.repos.channels.create({
      userId: user.id,
      platform: 'YOUTUBE',
      youtubeChannelId: null,
      name: body.name,
      description: null,
      thumbnailUrl: null,
      subscriberCount: null,
      videoCount: null,
      viewCount: null,
      statsFetchedAt: null,
      enabled: true,
      isDefault: existing.length === 0,
    });

    const settings = await services.repos.channelSettings.upsert(channel.id, body.settings);
    for (const source of defaultSourcesFor(channel.id, settings.niche, settings.language)) {
      await services.repos.discovery.createSource(source);
    }
    for (const rule of RulesEngine.defaultsFor(settings)) {
      await services.repos.rules.create(rule);
    }

    return reply.status(201).send({ channel, settings });
  });

  app.get('/api/channels/:channelId', async (request) => {
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const { channel, settings } = await requireChannel(services, request, channelId);
    const [oauth, competitors, sources, rules, upcoming] = await Promise.all([
      services.repos.oauth.findByChannel(channel.id),
      services.repos.competitors.listByChannel(channel.id),
      services.repos.discovery.listSources(channel.id),
      services.repos.rules.listByChannel(channel.id),
      services.scheduler.upcomingSlots(channel.id, 6),
    ]);
    return {
      channel,
      settings,
      connected: Boolean(oauth),
      scopes: oauth?.scope?.split(' ') ?? [],
      competitors,
      sources,
      rules,
      upcomingSlots: upcoming,
      budget: await services.budget.status(channel.id),
    };
  });

  app.patch('/api/channels/:channelId', async (request) => {
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const { channel } = await requireChannel(services, request, channelId);
    const body = z
      .object({
        name: z.string().min(1).max(120).optional(),
        enabled: z.boolean().optional(),
        isDefault: z.boolean().optional(),
        settings: settingsSchema.partial().optional(),
      })
      .parse(request.body);

    if (body.isDefault) await services.repos.channels.clearDefault(channel.userId);
    const updated = await services.repos.channels.update(channel.id, {
      name: body.name,
      enabled: body.enabled,
      isDefault: body.isDefault,
    });
    const settings = body.settings
      ? await services.repos.channelSettings.update(channel.id, body.settings)
      : await services.repos.channelSettings.findByChannel(channel.id);

    return { channel: updated, settings };
  });

  app.delete('/api/channels/:channelId', async (request) => {
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const { channel } = await requireChannel(services, request, channelId);
    await services.repos.channels.delete(channel.id);
    return { ok: true };
  });

  // ── OAuth connect / disconnect (spec §5) ─────────────────────────────────

  app.post('/api/channels/:channelId/connect', async (request) => {
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const { channel } = await requireChannel(services, request, channelId);

    const provider = services.registry.publishingAdapter();
    if (!provider) throw new AppError('provider_missing', 'No publishing provider is registered', { statusCode: 503 });
    if (!provider.isConfigured()) {
      throw new AppError(
        'provider_not_configured',
        'YouTube OAuth is not configured on this instance. Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET, then restart.',
        { statusCode: 503, details: { missing: provider.missingConfig() } },
      );
    }

    // The state parameter is signed so the callback can trust which channel it belongs to
    // and cannot be replayed (spec §46).
    const issuedAt = Math.floor(services.clock.now().getTime() / 1000);
    const payload = `${channel.id}.${issuedAt}`;
    const state = `${payload}.${signPayload(services.config.security.webhookSecret, payload, issuedAt)}`;

    return { authorizeUrl: provider.authorizeUrl(state), state };
  });

  app.get('/api/channels/oauth/callback', async (request, reply) => {
    const query = z
      .object({ code: z.string().optional(), state: z.string().optional(), error: z.string().optional() })
      .parse(request.query);

    const redirect = (path: string) => reply.redirect(`${services.config.http.appUrl}${path}`);
    if (query.error) return redirect(`/channels?error=${encodeURIComponent(query.error)}`);
    if (!query.code || !query.state) return redirect('/channels?error=missing_code');

    const [channelId, issuedAt, signature] = query.state.split('.');
    if (!channelId || !issuedAt || !signature) return redirect('/channels?error=bad_state');
    const valid = verifySignature(
      services.config.security.webhookSecret,
      `${channelId}.${issuedAt}`,
      Number(issuedAt),
      signature,
      900,
      services.clock.now().getTime(),
    );
    if (!valid) return redirect('/channels?error=state_expired');

    const provider = services.registry.publishing();
    if (!provider) return redirect('/channels?error=provider_missing');

    const tokens = await provider.exchangeCode(query.code);
    const remote = await provider.getChannel(tokens.accessToken);
    const encryptor = new AesGcmEncryptor(services.config.security.encryptionKey);

    await services.repos.channels.update(channelId, {
      youtubeChannelId: remote.id,
      name: remote.title,
      description: remote.description ?? null,
      thumbnailUrl: remote.thumbnailUrl ?? null,
      subscriberCount: remote.subscriberCount ?? null,
      videoCount: remote.videoCount ?? null,
      viewCount: remote.viewCount ?? null,
      statsFetchedAt: services.clock.now(),
    });
    await services.repos.oauth.upsert({
      channelId,
      provider: 'google',
      externalAccountId: remote.id,
      accessToken: encryptor.encrypt(tokens.accessToken),
      refreshToken: tokens.refreshToken ? encryptor.encrypt(tokens.refreshToken) : null,
      scope: tokens.scope,
      tokenType: tokens.tokenType,
      expiresAt: tokens.expiresAt,
    });

    return redirect(`/channels/${channelId}?connected=1`);
  });

  app.post('/api/channels/:channelId/disconnect', async (request) => {
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const { channel } = await requireChannel(services, request, channelId);

    const account = await services.repos.oauth.findByChannel(channel.id);
    const provider = services.registry.publishing();
    if (account && provider) {
      try {
        const encryptor = new AesGcmEncryptor(services.config.security.encryptionKey);
        await provider.revoke(encryptor.decrypt(account.refreshToken ?? account.accessToken));
      } catch {
        // The token may already be invalid upstream; the local disconnect still proceeds.
      }
    }
    await services.repos.oauth.deleteByChannel(channel.id);
    await services.repos.channels.update(channel.id, { youtubeChannelId: null });
    return { ok: true };
  });

  app.get('/api/channels/:channelId/schedule', async (request) => {
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const { channel, settings } = await requireChannel(services, request, channelId);
    const query = z.object({ count: z.coerce.number().int().min(1).max(60).default(12) }).parse(request.query);

    const slots = computeSlots(settings, services.clock.now(), query.count);
    const reserved = await services.repos.schedules.listUpcoming(channel.id, services.clock.now());
    const takenBySlot = new Map(reserved.filter((s) => s.videoId).map((s) => [s.publishAt.getTime(), s.videoId!]));

    return {
      timezone: settings.timezone,
      publishDays: settings.publishDays,
      publishTime: settings.defaultPublishTime,
      slots: slots.map((publishAt) => ({
        publishAt,
        videoId: takenBySlot.get(publishAt.getTime()) ?? null,
      })),
    };
  });

  // ── competitors (spec §9) ─────────────────────────────────────────────────

  app.get('/api/channels/:channelId/competitors', async (request) => {
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const { channel } = await requireChannel(services, request, channelId);
    return { competitors: await services.repos.competitors.listByChannel(channel.id) };
  });

  app.post('/api/channels/:channelId/competitors', async (request, reply) => {
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const { channel } = await requireChannel(services, request, channelId);
    const body = z
      .object({ youtubeChannelId: z.string().min(2).max(60), name: z.string().max(160).optional() })
      .parse(request.body);

    const provider = services.registry.publishing();
    let name = body.name ?? body.youtubeChannelId;
    let subscriberCount: number | null = null;
    if (provider?.isConfigured()) {
      try {
        const remote = await provider.lookupPublicChannel(body.youtubeChannelId);
        if (remote) {
          name = remote.title || name;
          subscriberCount = remote.subscriberCount ?? null;
        }
      } catch {
        // A lookup failure (no API key, quota) must not stop the user tracking a competitor.
      }
    }

    const competitor = await services.repos.competitors.create({
      channelId: channel.id,
      youtubeChannelId: body.youtubeChannelId,
      name,
      subscriberCount,
      uploadFrequency: null,
      avgViews: null,
      avgDurationSec: null,
      lastAnalyzedAt: null,
      snapshot: null,
    });
    return reply.status(201).send({ competitor });
  });

  app.delete('/api/channels/:channelId/competitors/:competitorId', async (request) => {
    const params = z.object({ channelId: z.string(), competitorId: z.string() }).parse(request.params);
    const { channel } = await requireChannel(services, request, params.channelId);
    const competitors = await services.repos.competitors.listByChannel(channel.id);
    if (!competitors.some((c) => c.id === params.competitorId)) throw new NotFoundError('Competitor');
    await services.repos.competitors.delete(params.competitorId);
    return { ok: true };
  });

  // ── discovery sources (spec §8) ───────────────────────────────────────────

  app.post('/api/channels/:channelId/sources', async (request, reply) => {
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const { channel } = await requireChannel(services, request, channelId);
    const body = z
      .object({
        kind: z.enum(SOURCE_KINDS),
        label: z.string().min(1).max(120),
        target: z.string().min(1).max(500),
      })
      .parse(request.body);

    if ((body.kind === 'RSS' || body.kind === 'WEBSITE') && !/^https?:\/\//.test(body.target)) {
      throw new ValidationError('An RSS or website source needs a full http(s) URL');
    }

    const source = await services.repos.discovery.createSource({ ...body, channelId: channel.id, enabled: true, lastRunAt: null });
    return reply.status(201).send({ source });
  });

  app.delete('/api/channels/:channelId/sources/:sourceId', async (request) => {
    const params = z.object({ channelId: z.string(), sourceId: z.string() }).parse(request.params);
    const { channel } = await requireChannel(services, request, params.channelId);
    const sources = await services.repos.discovery.listSources(channel.id);
    if (!sources.some((s) => s.id === params.sourceId)) throw new NotFoundError('Source');
    await services.repos.discovery.deleteSource(params.sourceId);
    return { ok: true };
  });

  app.post('/api/channels/:channelId/discover', async (request) => {
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const { channel, settings } = await requireChannel(services, request, channelId);
    const signals = await services.discovery.crawl(channel.id, {
      niche: settings.niche,
      language: settings.language,
    });
    return { signals: signals.slice(0, 60) };
  });

  // ── automation rules (spec §57) ───────────────────────────────────────────

  app.post('/api/channels/:channelId/rules', async (request, reply) => {
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const { channel } = await requireChannel(services, request, channelId);
    const body = z
      .object({
        name: z.string().min(1).max(120),
        condition: z.object({
          metric: z.enum(['ideaScore', 'qcScore', 'costUsd', 'factConfidence', 'thumbnailScore', 'retentionScore', 'qualityScore']),
          op: z.enum(['gt', 'gte', 'lt', 'lte', 'eq']),
          value: z.number(),
        }),
        action: z.object({ type: z.enum(['produce', 'regenerate', 'requireApproval', 'approve', 'reject', 'pause']) }).passthrough(),
        priority: z.number().int().min(0).max(1000).default(100),
      })
      .parse(request.body);

    const rule = await services.repos.rules.create({
      channelId: channel.id,
      name: body.name,
      condition: body.condition,
      action: body.action as { type: string },
      enabled: true,
      priority: body.priority,
    });
    return reply.status(201).send({ rule });
  });

  app.delete('/api/channels/:channelId/rules/:ruleId', async (request) => {
    const params = z.object({ channelId: z.string(), ruleId: z.string() }).parse(request.params);
    const { channel } = await requireChannel(services, request, params.channelId);
    const rules = await services.repos.rules.listByChannel(channel.id);
    if (!rules.some((r) => r.id === params.ruleId)) throw new NotFoundError('Rule');
    await services.repos.rules.delete(params.ruleId);
    return { ok: true };
  });

  // ── autopilot (spec §62) ──────────────────────────────────────────────────

  app.post('/api/channels/:channelId/autopilot', async (request) => {
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const { channel } = await requireChannel(services, request, channelId);
    const body = z.object({ enabled: z.boolean() }).parse(request.body);

    if (body.enabled) {
      const oauth = await services.repos.oauth.findByChannel(channel.id);
      if (!oauth) {
        throw new ConflictError('Connect the channel to YouTube before enabling autopilot');
      }
    }
    const settings = await services.repos.channelSettings.update(channel.id, { autopilotEnabled: body.enabled });
    return { settings };
  });

  app.post('/api/channels/:channelId/autopilot/run', async (request) => {
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const { channel } = await requireChannel(services, request, channelId);
    return services.autopilot.runForChannel(channel.id, { force: true });
  });
}
