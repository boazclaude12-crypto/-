import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRepositories } from '../db/memory/index.js';
import type { Repositories } from '../db/ports.js';
import { ConflictError } from '../shared/errors.js';
import { newId } from '../shared/ids.js';
import type { VideoRecord } from '../db/types.js';

/**
 * Repository parity.
 *
 * The domain runs against a port, so the two adapters must be behaviourally identical —
 * otherwise the whole test suite proves something about the in-memory implementation and
 * nothing about production. This file runs the same assertions against both.
 *
 * The Prisma block is skipped when TEST_DATABASE_URL is unset, so the suite still passes on
 * a machine with no PostgreSQL; set it to run the real thing:
 *
 *   TEST_DATABASE_URL=postgresql://factory:factory@127.0.0.1:5432/factory npm test
 */
const DATABASE_URL = process.env.TEST_DATABASE_URL;

interface Adapter {
  name: string;
  create(): Promise<Repositories>;
  reset(repos: Repositories): Promise<void>;
  close(repos: Repositories): Promise<void>;
}

const adapters: Adapter[] = [
  {
    name: 'in-memory',
    create: async () => new InMemoryRepositories(),
    reset: async (repos) => {
      (repos as InMemoryRepositories).reset();
    },
    close: async () => {},
  },
];

if (DATABASE_URL) {
  adapters.push({
    name: 'prisma/postgres',
    create: async () => {
      const { PrismaRepositories } = await import('../db/prisma/index.js');
      return new PrismaRepositories(DATABASE_URL);
    },
    reset: async () => {
      const { prismaClient } = await import('../db/prisma/client.js');
      const db = prismaClient(DATABASE_URL);
      // Users and music are the two roots; everything else cascades from a user.
      await db.$executeRawUnsafe('TRUNCATE TABLE users, music_tracks, providers RESTART IDENTITY CASCADE');
    },
    close: async (repos) => {
      await repos.close();
    },
  });
}

for (const adapter of adapters) {
  describe(`repositories · ${adapter.name}`, () => {
    let repos: Repositories;

    beforeEach(async () => {
      repos ??= await adapter.create();
      await adapter.reset(repos);
    });

    afterAll(async () => {
      if (repos) await adapter.close(repos);
    });

    /** Minimal tenant chain, since almost everything hangs off a channel. */
    async function tenant() {
      const user = await repos.users.create({
        email: `${newId()}@example.test`,
        passwordHash: 'scrypt$1$1$1$c2FsdA==$aGFzaA==',
        name: 'Owner',
        role: 'ADMIN',
      });
      const channel = await repos.channels.create({
        userId: user.id,
        platform: 'YOUTUBE',
        youtubeChannelId: null,
        name: 'Channel',
        description: null,
        thumbnailUrl: null,
        subscriberCount: null,
        videoCount: null,
        viewCount: null,
        statsFetchedAt: null,
        enabled: true,
        isDefault: true,
      });
      const settings = await repos.channelSettings.upsert(channel.id, {
        niche: 'history',
        language: 'en',
        targetAudience: 'adults',
        contentStyle: 'documentary',
        targetDurationMin: 10,
        videosPerWeek: 3,
        automationMode: 'SEMI_AUTO',
        autopilotEnabled: false,
        autopilotRunAt: '06:00',
        timezone: 'UTC',
        defaultPublishTime: '18:00',
        publishDays: [1, 3, 5],
        privacyStatus: 'private',
        voiceProviderId: null,
        voiceId: null,
        voiceSettings: null,
        visualStyle: 'cinematic',
        thumbnailStyle: 'bold',
        musicMood: 'neutral cinematic',
        monthlyBudgetUsd: 100,
        minIdeaScore: 60,
        minQcScore: 75,
        minFactConfidence: 0.5,
        minRetentionScore: 65,
        maxCostPerVideoUsd: 15,
        ideaWeights: null,
        bufferTargetVideos: 2,
      });
      return { user, channel, settings };
    }

    function videoInput(channelId: string, over: Partial<VideoRecord> = {}) {
      return {
        channelId,
        ideaId: null,
        templateId: null,
        title: 'A video',
        status: 'IDEA' as const,
        previousStatus: null,
        progress: {},
        targetDurationSec: 600,
        actualDurationSec: null,
        language: 'en',
        renderKey: null,
        renderWidth: null,
        renderHeight: null,
        fileSizeBytes: null,
        qualityScore: null,
        qualityBreakdown: null,
        factConfidence: null,
        retentionScore: null,
        estimatedCostUsd: 0,
        actualCostUsd: 0,
        failureReason: null,
        publishAt: null,
        publishedAt: null,
        youtubeVideoId: null,
        ...over,
      };
    }

    // ── identity ─────────────────────────────────────────────────────────────

    it('rejects a duplicate email with a conflict, not a raw driver error', async () => {
      const email = `${newId()}@example.test`;
      await repos.users.create({ email, passwordHash: 'x', name: null, role: 'USER' });
      await expect(
        repos.users.create({ email, passwordHash: 'x', name: null, role: 'USER' }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('looks users up by email case-insensitively', async () => {
      const email = `Mixed-${newId()}@Example.Test`;
      const created = await repos.users.create({ email, passwordHash: 'x', name: null, role: 'USER' });
      const found = await repos.users.findByEmail(email.toUpperCase());
      expect(found?.id).toBe(created.id);
    });

    it('honours session revocation and expiry cleanup', async () => {
      const { user } = await tenant();
      const live = await repos.sessions.create({
        userId: user.id, tokenHash: `live-${newId()}`, userAgent: 'test', ip: '127.0.0.1',
        expiresAt: new Date(Date.now() + 3600_000), revokedAt: null,
      });
      await repos.sessions.create({
        userId: user.id, tokenHash: `stale-${newId()}`, userAgent: null, ip: null,
        expiresAt: new Date(Date.now() - 3600_000), revokedAt: null,
      });

      expect((await repos.sessions.findByTokenHash(live.tokenHash))?.revokedAt).toBeFalsy();
      await repos.sessions.revoke(live.id, new Date());
      expect((await repos.sessions.findByTokenHash(live.tokenHash))?.revokedAt).toBeTruthy();

      expect(await repos.sessions.deleteExpired(new Date())).toBe(1);
    });

    // ── numbers that cross the 32-bit boundary ───────────────────────────────

    it('round-trips 64-bit counters without precision loss', async () => {
      const { channel } = await tenant();
      // A large channel really does exceed 2^31 lifetime views.
      const viewCount = 9_876_543_210;
      const updated = await repos.channels.update(channel.id, { viewCount, subscriberCount: 1_200_000 });
      expect(updated.viewCount).toBe(viewCount);
      expect((await repos.channels.findById(channel.id))?.viewCount).toBe(viewCount);

      const video = await repos.videos.create(videoInput(channel.id));
      const bytes = 5_368_709_120; // 5 GiB render
      await repos.videos.update(video.id, { fileSizeBytes: bytes });
      expect((await repos.videos.findById(video.id))?.fileSizeBytes).toBe(bytes);

      await repos.uploads.upsert(video.id, {
        state: 'UPLOADING', privacyStatus: 'private', youtubeVideoId: null,
        resumableUri: null, bytesUploaded: bytes, error: null,
        startedAt: new Date(), completedAt: null,
      });
      expect((await repos.uploads.findByVideo(video.id))?.bytesUploaded).toBe(bytes);
    });

    // ── JSON and array columns ───────────────────────────────────────────────

    it('round-trips JSON structures and string arrays', async () => {
      const { channel } = await tenant();
      const video = await repos.videos.create(videoInput(channel.id));

      const sections = [
        { heading: 'One', narration: 'Text', targetSeconds: 90, patternInterrupt: 'a number' },
        { heading: 'Two', narration: 'More', targetSeconds: 120 },
      ];
      await repos.scripts.upsert(video.id, {
        structure: 'chronological', hook: 'h', intro: 'i', sections, cta: 'c',
        wordCount: 100, estimatedDuration: 210, retentionScore: 80,
        retentionNotes: [{ name: 'hook', passed: true, detail: 'strong' }],
        factCheckScore: 0.9, factCheckReport: { claims: [], removals: ['drop this'] }, revision: 1,
      });
      const script = await repos.scripts.findByVideo(video.id);
      expect(script?.sections).toEqual(sections);
      expect((script?.factCheckReport as { removals: string[] }).removals).toEqual(['drop this']);

      await repos.seo.upsert(video.id, {
        title: 'T', titleCandidates: [{ text: 'A', score: 90 }], description: 'D',
        tags: ['one', 'two', 'three'], hashtags: ['#a'], keywords: ['k1', 'k2'],
        chapters: [{ startSec: 0, title: 'Intro' }, { startSec: 90, title: 'Body' }],
        categoryId: '27',
      });
      const seo = await repos.seo.findByVideo(video.id);
      expect(seo?.tags).toEqual(['one', 'two', 'three']);
      expect(seo?.chapters).toEqual([{ startSec: 0, title: 'Intro' }, { startSec: 90, title: 'Body' }]);

      const timeline = { version: 1, scenes: [{ index: 0, startSec: 0 }], durationSec: 210 };
      await repos.timelines.upsert(video.id, timeline, 'ffmpeg -i a.png out.mp4');
      const stored = await repos.timelines.findByVideo(video.id);
      expect(stored?.document).toEqual(timeline);
      expect(stored?.renderCmd).toContain('ffmpeg');
    });

    // ── aggregation ──────────────────────────────────────────────────────────

    it('round-trips every writable field through create, not just the common ones', async () => {
      // An enumerated `create` that forgets a column drops it silently. This asserts the
      // whole record survives, so the omission shows up here rather than as an empty query
      // result in production.
      const { channel } = await tenant();
      const publishAt = new Date(Date.now() + 86_400_000);
      const publishedAt = new Date(Date.now() - 3600_000);

      const created = await repos.videos.create(videoInput(channel.id, {
        title: 'Fully specified',
        status: 'PUBLISHED',
        previousStatus: 'SCHEDULED',
        progress: { EDITING: 100, QC: 100 },
        targetDurationSec: 720,
        actualDurationSec: 715.5,
        language: 'he',
        renderKey: 'channels/c/videos/v/renders/final.mp4',
        renderWidth: 1920,
        renderHeight: 1080,
        fileSizeBytes: 1_234_567_890,
        qualityScore: 88.5,
        qualityBreakdown: { research: 90, script: 87 },
        factConfidence: 0.91,
        retentionScore: 76,
        estimatedCostUsd: 4.2,
        actualCostUsd: 3.87,
        failureReason: null,
        publishAt,
        publishedAt,
        youtubeVideoId: 'abcdefghijk',
      }));

      const reloaded = await repos.videos.findById(created.id);
      expect(reloaded).toMatchObject({
        title: 'Fully specified',
        status: 'PUBLISHED',
        previousStatus: 'SCHEDULED',
        targetDurationSec: 720,
        actualDurationSec: 715.5,
        language: 'he',
        renderKey: 'channels/c/videos/v/renders/final.mp4',
        renderWidth: 1920,
        renderHeight: 1080,
        fileSizeBytes: 1_234_567_890,
        qualityScore: 88.5,
        factConfidence: 0.91,
        retentionScore: 76,
        youtubeVideoId: 'abcdefghijk',
      });
      expect(reloaded?.progress).toEqual({ EDITING: 100, QC: 100 });
      expect(reloaded?.qualityBreakdown).toEqual({ research: 90, script: 87 });
      expect(reloaded?.publishAt?.getTime()).toBe(publishAt.getTime());
      expect(reloaded?.publishedAt?.getTime()).toBe(publishedAt.getTime());

      // Same guarantee for the other records created with non-default fields.
      const source = await repos.discovery.createSource({
        channelId: channel.id, kind: 'RSS', label: 'Feed', target: 'https://example.org/feed.xml',
        enabled: false, lastRunAt: publishedAt,
      });
      expect(source.enabled).toBe(false);
      expect(source.lastRunAt?.getTime()).toBe(publishedAt.getTime());

      const competitor = await repos.competitors.create({
        channelId: channel.id, youtubeChannelId: `UC${newId().slice(0, 20)}`, name: 'Rival',
        subscriberCount: 420_000, uploadFrequency: 2.5, avgViews: 180_000,
        avgDurationSec: 900, lastAnalyzedAt: publishedAt, snapshot: { recentVideos: [] },
      });
      expect(competitor.lastAnalyzedAt?.getTime()).toBe(publishedAt.getTime());
      expect(competitor.avgViews).toBe(180_000);

      const withStats = await repos.channels.create({
        userId: (await repos.channels.findById(channel.id))!.userId,
        platform: 'YOUTUBE', youtubeChannelId: `UC${newId().slice(0, 20)}`, name: 'Second',
        description: 'desc', thumbnailUrl: 'https://img', subscriberCount: 10,
        videoCount: 5, viewCount: 12_345, statsFetchedAt: publishedAt,
        enabled: false, isDefault: false,
      });
      expect(withStats.statsFetchedAt?.getTime()).toBe(publishedAt.getTime());
      expect(withStats.enabled).toBe(false);
      expect(withStats.description).toBe('desc');
    });

    it('counts videos by status and pages the list', async () => {
      const { channel } = await tenant();
      await repos.videos.create(videoInput(channel.id, { title: 'a', status: 'PUBLISHED' }));
      await repos.videos.create(videoInput(channel.id, { title: 'b', status: 'PUBLISHED' }));
      await repos.videos.create(videoInput(channel.id, { title: 'c', status: 'EDITING' }));

      const counts = await repos.videos.countByStatus(channel.id);
      expect(counts.PUBLISHED).toBe(2);
      expect(counts.EDITING).toBe(1);

      const page = await repos.videos.listByChannel(channel.id, { limit: 2, offset: 0 });
      expect(page.items).toHaveLength(2);
      expect(page.total).toBe(3);

      const filtered = await repos.videos.listByChannel(channel.id, { status: ['PUBLISHED'] });
      expect(filtered.total).toBe(2);
    });

    it('sums and breaks down spend by provider inside a window', async () => {
      const { channel } = await tenant();
      const now = new Date();
      const record = (provider: string, cost: number) =>
        repos.usage.record({
          channelId: channel.id, videoId: null, jobId: null, provider,
          operation: 'test', model: null, inputUnits: 10, outputUnits: 5, unit: 'token',
          estimatedCost: cost, actualCost: cost, latencyMs: 100, status: 'ok', error: null,
        });

      await record('anthropic', 0.02);
      await record('anthropic', 0.03);
      await record('elevenlabs', 0.5);

      const from = new Date(now.getTime() - 3600_000);
      const to = new Date(now.getTime() + 3600_000);
      expect(await repos.usage.sumForChannel(channel.id, from, to)).toBeCloseTo(0.55, 4);

      const breakdown = await repos.usage.breakdownByProvider(from, to, channel.id);
      expect(breakdown[0]).toMatchObject({ provider: 'elevenlabs', calls: 1 });
      expect(breakdown.find((b) => b.provider === 'anthropic')).toMatchObject({ calls: 2 });
      expect(breakdown.find((b) => b.provider === 'anthropic')?.cost).toBeCloseTo(0.05, 4);

      // A window that excludes everything must sum to zero, not to the total.
      const past = new Date(now.getTime() - 86_400_000 * 30);
      expect(await repos.usage.sumForChannel(channel.id, past, from)).toBe(0);
    });

    it('reports per-prompt-version agent statistics', async () => {
      const { channel } = await tenant();
      const video = await repos.videos.create(videoInput(channel.id));
      const run = (version: number, ok: boolean, latencyMs: number, costUsd: number) =>
        repos.agentRuns.record({
          videoId: video.id, agent: 'SCRIPT_AGENT', promptId: null, promptName: 'SCRIPT_AGENT',
          promptVersion: version, provider: 'anthropic', model: 'claude', ok, attempts: 1,
          latencyMs, costUsd, input: null, output: null, error: ok ? null : 'boom',
        });

      await run(1, true, 1000, 0.01);
      await run(1, false, 2000, 0.02);
      await run(2, true, 500, 0.005);

      const stats = await repos.agentRuns.statsByPrompt('SCRIPT_AGENT');
      const v1 = stats.find((s) => s.version === 1)!;
      const v2 = stats.find((s) => s.version === 2)!;
      expect(v1.runs).toBe(2);
      expect(v1.okRate).toBeCloseTo(0.5, 2);
      expect(v1.avgLatencyMs).toBe(1500);
      expect(v2.okRate).toBeCloseTo(1, 2);
    });

    // ── relational integrity ─────────────────────────────────────────────────

    it('cascades a channel delete through its videos and artefacts', async () => {
      const { channel } = await tenant();
      const video = await repos.videos.create(videoInput(channel.id));
      await repos.scripts.upsert(video.id, {
        structure: 's', hook: 'h', intro: 'i', sections: [], cta: 'c',
        wordCount: 1, estimatedDuration: 1, retentionScore: null, retentionNotes: null,
        factCheckScore: null, factCheckReport: null, revision: 1,
      });
      await repos.scenes.replaceAll(video.id, [
        {
          index: 0, durationSec: 5, narration: 'n', visualBrief: 'v', prompt: 'p',
          negativePrompt: null, camera: null, style: null, aspectRatio: '16:9', characters: [],
          location: null, lighting: null, motion: null, continuityNotes: null, textOverlay: null,
          sfx: null, importance: 0.5, strategy: 'IMAGE_MOTION', assetId: null,
        },
      ]);

      await repos.channels.delete(channel.id);

      expect(await repos.channels.findById(channel.id)).toBeNull();
      expect(await repos.videos.findById(video.id)).toBeNull();
      expect(await repos.scripts.findByVideo(video.id)).toBeNull();
      expect(await repos.scenes.listByVideo(video.id)).toHaveLength(0);
    });

    it('replaceAll is a true replacement, not an append', async () => {
      const { channel } = await tenant();
      const video = await repos.videos.create(videoInput(channel.id));
      const scene = (index: number) => ({
        index, durationSec: 5, narration: `n${index}`, visualBrief: 'v', prompt: 'p',
        negativePrompt: null, camera: null, style: null, aspectRatio: '16:9', characters: [],
        location: null, lighting: null, motion: null, continuityNotes: null, textOverlay: null,
        sfx: null, importance: 0.5, strategy: 'IMAGE_MOTION' as const, assetId: null,
      });

      await repos.scenes.replaceAll(video.id, [scene(0), scene(1), scene(2)]);
      expect(await repos.scenes.listByVideo(video.id)).toHaveLength(3);

      await repos.scenes.replaceAll(video.id, [scene(0)]);
      const remaining = await repos.scenes.listByVideo(video.id);
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.index).toBe(0);
    });

    it('keeps exactly one thumbnail selected', async () => {
      const { channel } = await tenant();
      const video = await repos.videos.create(videoInput(channel.id));
      await repos.thumbnails.replaceAll(video.id, ['A', 'B', 'C'].map((variant, i) => ({
        variant, concept: `c${variant}`, prompt: 'p', storageKey: `k${variant}`,
        ctrPotential: 70 + i, selected: false, provider: 'mock', costUsd: 0,
      })));

      await repos.thumbnails.select(video.id, 'B');
      let all = await repos.thumbnails.listByVideo(video.id);
      expect(all.filter((t) => t.selected).map((t) => t.variant)).toEqual(['B']);

      await repos.thumbnails.select(video.id, 'C');
      all = await repos.thumbnails.listByVideo(video.id);
      expect(all.filter((t) => t.selected).map((t) => t.variant)).toEqual(['C']);
    });

    it('releases a schedule slot without deleting it', async () => {
      const { channel } = await tenant();
      const video = await repos.videos.create(videoInput(channel.id));
      const publishAt = new Date(Date.now() + 86_400_000);
      await repos.schedules.create({ channelId: channel.id, videoId: video.id, publishAt, timezone: 'UTC', reserved: true });

      expect((await repos.schedules.findByVideo(video.id))?.reserved).toBe(true);
      await repos.schedules.release(video.id);
      expect(await repos.schedules.findByVideo(video.id)).toBeNull();

      const slots = await repos.schedules.listUpcoming(channel.id, new Date(Date.now() - 1000));
      expect(slots).toHaveLength(1);
      expect(slots[0]!.videoId).toBeNull();
      expect(slots[0]!.reserved).toBe(false);
    });

    it('rejects a duplicate competitor on the same channel', async () => {
      const { channel } = await tenant();
      const input = {
        channelId: channel.id, youtubeChannelId: 'UCduplicate0000000000001', name: 'Rival',
        subscriberCount: null, uploadFrequency: null, avgViews: null, avgDurationSec: null,
        lastAnalyzedAt: null, snapshot: null,
      };
      await repos.competitors.create(input);
      await expect(repos.competitors.create(input)).rejects.toBeInstanceOf(ConflictError);
    });

    // ── domain queries the pipeline depends on ───────────────────────────────

    it('picks the best eligible idea and respects the score gate', async () => {
      const { channel } = await tenant();
      const idea = (title: string, score: number, status: 'PROPOSED' | 'APPROVED') => ({
        channelId: channel.id, title, topic: 't', angle: 'a', hook: 'h', targetAudience: 'x',
        rationale: null, status, estimatedDemand: 80, competition: 30, novelty: 70,
        evergreenScore: 70, trendScore: 70, productionCostUsd: 1, estimatedCtr: 70,
        estimatedRetention: 70, overallScore: score, scoreBreakdown: null, sourceSignals: null,
      });
      await repos.ideas.createMany([
        idea('weak', 40, 'APPROVED'),
        idea('strong', 90, 'APPROVED'),
        idea('unapproved', 95, 'PROPOSED'),
      ]);

      expect((await repos.ideas.bestCandidate(channel.id, 60, false))?.title).toBe('strong');
      // Full auto may take a proposed idea, and takes the highest scoring one.
      expect((await repos.ideas.bestCandidate(channel.id, 60, true))?.title).toBe('unapproved');
      expect(await repos.ideas.bestCandidate(channel.id, 99, true)).toBeNull();
    });

    it('finds videos whose publishing slot has arrived', async () => {
      const { channel } = await tenant();
      const now = new Date();
      await repos.videos.create(videoInput(channel.id, {
        title: 'due', status: 'SCHEDULED', publishAt: new Date(now.getTime() - 60_000),
      }));
      await repos.videos.create(videoInput(channel.id, {
        title: 'later', status: 'SCHEDULED', publishAt: new Date(now.getTime() + 86_400_000),
      }));
      await repos.videos.create(videoInput(channel.id, {
        title: 'not scheduled', status: 'READY', publishAt: new Date(now.getTime() - 60_000),
      }));

      const due = await repos.videos.listDueForPublish(now);
      expect(due.map((v) => v.title)).toEqual(['due']);
    });

    it('prefers a user prompt override over the system version', async () => {
      const { user } = await tenant();
      await repos.prompts.create({
        userId: null, name: 'SCRIPT_AGENT', version: 1, provider: null,
        systemPrompt: 'system v1', userTemplate: 'u', variables: [], active: true, notes: null,
      });
      expect((await repos.prompts.findActive('SCRIPT_AGENT', user.id))?.systemPrompt).toBe('system v1');

      await repos.prompts.create({
        userId: user.id, name: 'SCRIPT_AGENT', version: 1, provider: null,
        systemPrompt: 'mine', userTemplate: 'u', variables: [], active: true, notes: null,
      });
      expect((await repos.prompts.findActive('SCRIPT_AGENT', user.id))?.systemPrompt).toBe('mine');
      // Another user still gets the system prompt.
      expect((await repos.prompts.findActive('SCRIPT_AGENT', null))?.systemPrompt).toBe('system v1');
    });

    it('activating a prompt version deactivates its siblings', async () => {
      await repos.prompts.create({
        userId: null, name: 'SEO_AGENT', version: 1, provider: null,
        systemPrompt: 'v1', userTemplate: 'u', variables: [], active: true, notes: null,
      });
      const v2 = await repos.prompts.create({
        userId: null, name: 'SEO_AGENT', version: 2, provider: null,
        systemPrompt: 'v2', userTemplate: 'u', variables: [], active: false, notes: null,
      });

      await repos.prompts.activate(v2.id);
      const versions = await repos.prompts.listVersions('SEO_AGENT');
      expect(versions.filter((v) => v.active).map((v) => v.version)).toEqual([2]);
    });

    it('returns only the latest analytics snapshot per video', async () => {
      const { channel } = await tenant();
      const video = await repos.videos.create(videoInput(channel.id, { status: 'PUBLISHED' }));
      const snapshot = (views: number, minutesAgo: number) =>
        repos.analytics.create({
          videoId: video.id, capturedAt: new Date(Date.now() - minutesAgo * 60_000),
          views, watchTimeMinutes: 10, averageViewDuration: 100, averageViewPercentage: 40,
          impressions: 1000, ctr: 5, likes: 1, comments: 1, shares: 0, subscribersGained: 1,
          estimatedRevenueUsd: null, raw: null,
        });

      await snapshot(100, 120);
      await snapshot(250, 10);

      expect((await repos.analytics.latestByVideo(video.id))?.views).toBe(250);
      const latest = await repos.analytics.latestForChannel(channel.id, [video.id]);
      expect(latest).toHaveLength(1);
      expect(latest[0]!.views).toBe(250);
      expect(await repos.analytics.listByVideo(video.id)).toHaveLength(2);
    });

    it('records every job attempt rather than only the last', async () => {
      const { channel } = await tenant();
      const video = await repos.videos.create(videoInput(channel.id));
      const job = await repos.jobs.create({
        queue: 'pipeline', name: 'advance:IDEA', channelId: channel.id, videoId: video.id,
        state: 'QUEUED', payload: { videoId: video.id }, attemptCount: 0, maxAttempts: 3,
      });

      await repos.jobs.recordError({ jobId: job.id, attempt: 1, message: 'first', stack: null, provider: 'anthropic' });
      await repos.jobs.recordError({ jobId: job.id, attempt: 2, message: 'second', stack: null, provider: 'openai' });
      await repos.jobs.update(job.id, { state: 'FAILED', attemptCount: 2, lastError: 'second' });

      const errors = await repos.jobs.listErrors(10);
      expect(errors.map((e) => e.message)).toEqual(['second', 'first']);
      expect((await repos.jobs.countByState()).FAILED).toBe(1);
      expect((await repos.jobs.listByVideo(video.id))[0]!.attemptCount).toBe(2);
    });

    it('finds an asset by checksum, which is what makes reuse cheap', async () => {
      const { channel } = await tenant();
      const video = await repos.videos.create(videoInput(channel.id));
      await repos.assets.create({
        videoId: video.id, kind: 'IMAGE', storageKey: 'k', mimeType: 'image/png',
        bytes: 100, durationSec: null, width: 1920, height: 1080, provider: 'higgsfield',
        externalId: 'req-1', costUsd: 0.03, license: 'generated', attribution: null,
        checksum: 'prompt-abc123', metadata: { sceneIndex: 0 },
      });

      expect((await repos.assets.findByChecksum('prompt-abc123'))?.provider).toBe('higgsfield');
      expect(await repos.assets.findByChecksum('prompt-missing')).toBeNull();
      expect(await repos.assets.listByVideo(video.id, 'IMAGE')).toHaveLength(1);
      expect(await repos.assets.listByVideo(video.id, 'VIDEO')).toHaveLength(0);
    });

    it('upserts channel settings instead of duplicating them', async () => {
      const { channel, settings } = await tenant();
      const updated = await repos.channelSettings.update(channel.id, { videosPerWeek: 5, autopilotEnabled: true });
      expect(updated.id).toBe(settings.id);
      expect(updated.videosPerWeek).toBe(5);
      expect(updated.autopilotEnabled).toBe(true);
      // Unmentioned fields survive a partial update.
      expect(updated.niche).toBe('history');
    });

    it('filters notification targets by event subscription', async () => {
      const { user } = await tenant();
      await repos.notifications.create({ userId: user.id, kind: 'email', target: 'a@x.test', events: ['UPLOAD_SUCCESS'], enabled: true });
      await repos.notifications.create({ userId: user.id, kind: 'slack', target: 'https://x', events: [], enabled: true });
      await repos.notifications.create({ userId: user.id, kind: 'discord', target: 'https://y', events: [], enabled: false });

      expect(await repos.notifications.listForEvent(user.id, 'UPLOAD_SUCCESS')).toHaveLength(2);
      expect(await repos.notifications.listForEvent(user.id, 'QC_FAILED')).toHaveLength(1);
      expect((await repos.notifications.findByKindTarget('email', 'a@x.test'))?.userId).toBe(user.id);
    });

    it('stores encrypted oauth material and replaces it on reconnect', async () => {
      const { channel } = await tenant();
      const expiresAt = new Date(Date.now() + 3600_000);
      await repos.oauth.upsert({
        channelId: channel.id, provider: 'google', externalAccountId: 'UC1',
        accessToken: 'cipher-1', refreshToken: 'cipher-r', scope: 'a b',
        tokenType: 'Bearer', expiresAt,
      });
      await repos.oauth.upsert({
        channelId: channel.id, provider: 'google', externalAccountId: 'UC1',
        accessToken: 'cipher-2', refreshToken: 'cipher-r', scope: 'a b',
        tokenType: 'Bearer', expiresAt,
      });

      const stored = await repos.oauth.findByChannel(channel.id);
      expect(stored?.accessToken).toBe('cipher-2');

      await repos.oauth.deleteByChannel(channel.id);
      expect(await repos.oauth.findByChannel(channel.id)).toBeNull();
    });
  });
}
