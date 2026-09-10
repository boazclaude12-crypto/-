import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../../services/container.js';
import { requireAdmin, requireChannel, requireUser, requireVideo } from '../middleware/auth.js';
import { monthWindow } from '../../services/budget.js';
import { PIPELINE_STAGES } from '../../pipeline/state-machine.js';
import { NotFoundError } from '../../shared/errors.js';

export async function insightRoutes(app: FastifyInstance, services: AppServices): Promise<void> {
  // ── dashboard overview (spec §6) ─────────────────────────────────────────

  app.get('/api/overview', async (request) => {
    const query = z.object({ channelId: z.string() }).parse(request.query);
    const { channel, settings } = await requireChannel(services, request, query.channelId);

    const now = services.clock.now();
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    const [counts, publishedWeek, publishedAll, budget, buffer, upcoming] = await Promise.all([
      services.repos.videos.countByStatus(channel.id),
      services.repos.videos.listPublishedSince(channel.id, weekAgo),
      services.repos.videos.listPublishedSince(channel.id, new Date(now.getTime() - 365 * 86_400_000)),
      services.budget.status(channel.id),
      services.autopilot.buffer(channel, settings),
      services.scheduler.upcomingSlots(channel.id, 5),
    ]);

    const snapshots = await services.repos.analytics.latestForChannel(
      channel.id,
      publishedAll.map((v) => v.id),
    );
    const byVideo = new Map(snapshots.map((s) => [s.videoId, s]));

    const totals = snapshots.reduce(
      (acc, s) => ({
        views: acc.views + s.views,
        watchTimeMinutes: acc.watchTimeMinutes + s.watchTimeMinutes,
        impressions: acc.impressions + s.impressions,
        subscribersGained: acc.subscribersGained + s.subscribersGained,
        revenue: acc.revenue + (s.estimatedRevenueUsd ?? 0),
        avgViewDuration: acc.avgViewDuration + s.averageViewDuration,
      }),
      { views: 0, watchTimeMinutes: 0, impressions: 0, subscribersGained: 0, revenue: 0, avgViewDuration: 0 },
    );

    const ranked = [...publishedAll]
      .map((video) => ({ video, snapshot: byVideo.get(video.id) }))
      .filter((entry) => entry.snapshot)
      .sort((a, b) => (b.snapshot!.views ?? 0) - (a.snapshot!.views ?? 0));

    const inFlight = await services.repos.videos.listByChannel(channel.id, {
      status: PIPELINE_STAGES.filter((s) => !['PUBLISHED', 'ANALYZING'].includes(s.status)).map((s) => s.status),
      limit: 12,
    });

    return {
      channel: { id: channel.id, name: channel.name, youtubeChannelId: channel.youtubeChannelId, subscriberCount: channel.subscriberCount },
      settings: {
        automationMode: settings.automationMode,
        autopilotEnabled: settings.autopilotEnabled,
        videosPerWeek: settings.videosPerWeek,
      },
      thisWeek: {
        created: (await services.repos.videos.listByChannel(channel.id, { limit: 200 })).items.filter(
          (v) => v.createdAt >= weekAgo,
        ).length,
        published: publishedWeek.length,
        scheduled: counts.SCHEDULED ?? 0,
      },
      metrics: {
        views: totals.views,
        watchTimeMinutes: Math.round(totals.watchTimeMinutes),
        impressions: totals.impressions,
        ctr: totals.impressions ? round((totals.views / totals.impressions) * 100, 2) : 0,
        averageViewDuration: snapshots.length ? Math.round(totals.avgViewDuration / snapshots.length) : 0,
        subscribersGained: totals.subscribersGained,
        estimatedRevenueUsd: round(totals.revenue, 2),
        videosMeasured: snapshots.length,
      },
      topVideo: ranked[0]
        ? { id: ranked[0].video.id, title: ranked[0].video.title, views: ranked[0].snapshot!.views, ctr: ranked[0].snapshot!.ctr }
        : null,
      worstVideo: ranked.length > 1
        ? {
            id: ranked[ranked.length - 1]!.video.id,
            title: ranked[ranked.length - 1]!.video.title,
            views: ranked[ranked.length - 1]!.snapshot!.views,
            ctr: ranked[ranked.length - 1]!.snapshot!.ctr,
          }
        : null,
      pipeline: {
        counts,
        buffer,
        inFlight: inFlight.items.map((v) => ({
          id: v.id,
          title: v.title,
          status: v.status,
          progress: v.progress ?? {},
          updatedAt: v.updatedAt,
        })),
      },
      budget,
      upcomingSlots: upcoming,
    };
  });

  // ── analytics (spec §34) ─────────────────────────────────────────────────

  app.get('/api/analytics', async (request) => {
    const query = z
      .object({ channelId: z.string(), days: z.coerce.number().int().min(1).max(365).default(30) })
      .parse(request.query);
    const { channel } = await requireChannel(services, request, query.channelId);

    const since = new Date(services.clock.now().getTime() - query.days * 86_400_000);
    const videos = await services.repos.videos.listPublishedSince(channel.id, since);
    const snapshots = await services.repos.analytics.latestForChannel(channel.id, videos.map((v) => v.id));
    const byVideo = new Map(snapshots.map((s) => [s.videoId, s]));

    return {
      since,
      videos: videos.map((video) => {
        const snapshot = byVideo.get(video.id);
        return {
          id: video.id,
          title: video.title,
          youtubeVideoId: video.youtubeVideoId,
          publishedAt: video.publishedAt,
          durationSec: video.actualDurationSec ?? video.targetDurationSec,
          qualityScore: video.qualityScore,
          views: snapshot?.views ?? 0,
          watchTimeMinutes: snapshot?.watchTimeMinutes ?? 0,
          averageViewPercentage: snapshot?.averageViewPercentage ?? 0,
          ctr: snapshot?.ctr ?? 0,
          impressions: snapshot?.impressions ?? 0,
          subscribersGained: snapshot?.subscribersGained ?? 0,
          likes: snapshot?.likes ?? 0,
          comments: snapshot?.comments ?? 0,
        };
      }),
      baseline: await services.learning.baseline(channel.id, query.days),
      learnings: (await services.repos.learnings.listByChannel(channel.id, 30)).map((l) => ({
        dimension: l.dimension,
        observation: l.observation,
        predicted: l.predicted,
        actual: l.actual,
        delta: l.delta,
        weight: l.weight,
        createdAt: l.createdAt,
      })),
      strategy: await services.repos.strategies.latest(channel.id),
    };
  });

  app.post('/api/analytics/:videoId/collect', async (request) => {
    const { videoId } = z.object({ videoId: z.string() }).parse(request.params);
    const { video } = await requireVideo(services, request, videoId);
    const jobId = await services.runner.enqueue(video.id, { reason: 'manual analytics', expectStatus: 'PUBLISHED' });
    return { jobId };
  });

  app.post('/api/analytics/:channelId/strategy', async (request) => {
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const { channel } = await requireChannel(services, request, channelId);
    const plan = await services.autopilot.runWeeklyStrategy(channel.id);
    if (!plan) throw new NotFoundError('Channel');
    return plan;
  });

  // ── costs (spec §41) ─────────────────────────────────────────────────────

  app.get('/api/costs', async (request) => {
    const query = z.object({ channelId: z.string().optional() }).parse(request.query);
    const user = requireUser(request);
    if (query.channelId) await requireChannel(services, request, query.channelId);

    const now = services.clock.now();
    const { start, end } = monthWindow(now);
    const monthly = await services.costReporter.monthly(start, end, query.channelId);

    const channels = query.channelId
      ? [await services.repos.channels.findById(query.channelId)].filter(Boolean)
      : await services.repos.channels.listByUser(user.id);

    const perChannel = await Promise.all(
      channels.map(async (channel) => ({
        channelId: channel!.id,
        name: channel!.name,
        budget: await services.budget.status(channel!.id),
      })),
    );

    const videoIds = query.channelId
      ? (await services.repos.videos.listByChannel(query.channelId, { limit: 25 })).items
      : [];
    const perVideo = await Promise.all(
      videoIds.map(async (video) => {
        const cost = await services.repos.usage.sumForVideo(video.id);
        const duration = video.actualDurationSec ?? video.targetDurationSec;
        return {
          videoId: video.id,
          title: video.title,
          status: video.status,
          costUsd: round(cost, 4),
          costPerMinuteUsd: duration > 0 ? round((cost / duration) * 60, 4) : 0,
        };
      }),
    );

    return {
      month: { start, end },
      total: monthly.total,
      byProvider: monthly.byProvider,
      channels: perChannel,
      videos: perVideo,
      recent: (await services.repos.usage.listRecent(50, query.channelId)).map((u) => ({
        createdAt: u.createdAt,
        provider: u.provider,
        operation: u.operation,
        model: u.model,
        costUsd: u.actualCost || u.estimatedCost,
        latencyMs: u.latencyMs,
        status: u.status,
      })),
    };
  });

  // ── providers (spec §3, §81) ─────────────────────────────────────────────

  app.get('/api/providers', async (request) => {
    requireUser(request);
    const health = await services.registry.healthAll();
    return {
      offline: services.config.offline,
      providers: health.map((entry) => ({
        key: entry.key,
        name: entry.name,
        capabilities: entry.capabilities,
        configured: entry.configured,
        missingEnv: entry.missing,
        healthy: entry.health.ok,
        detail: entry.health.detail,
        latencyMs: entry.health.latencyMs,
      })),
      notifications: services.notifier.available(),
      storage: services.storage.driver,
      queue: services.queue.driver,
      ffmpeg: await services.renderer.tools.available(),
    };
  });

  // ── prompt library (spec §51) ────────────────────────────────────────────

  app.get('/api/prompts', async (request) => {
    requireUser(request);
    const prompts = await services.repos.prompts.list();
    const names = [...new Set(prompts.map((p) => p.name))];
    return {
      prompts: await Promise.all(
        names.map(async (name) => ({
          name,
          versions: (await services.repos.prompts.listVersions(name)).map((v) => ({
            id: v.id,
            version: v.version,
            active: v.active,
            notes: v.notes,
            updatedAt: v.updatedAt,
          })),
          stats: await services.repos.agentRuns.statsByPrompt(name),
        })),
      ),
    };
  });

  app.get('/api/prompts/:name', async (request) => {
    requireUser(request);
    const { name } = z.object({ name: z.string() }).parse(request.params);
    const versions = await services.repos.prompts.listVersions(name);
    if (versions.length === 0) throw new NotFoundError('Prompt');
    return { name, versions, stats: await services.repos.agentRuns.statsByPrompt(name) };
  });

  app.post('/api/prompts/:name/versions', async (request, reply) => {
    const user = requireUser(request);
    const { name } = z.object({ name: z.string() }).parse(request.params);
    const body = z
      .object({
        systemPrompt: z.string().min(20).max(20_000),
        userTemplate: z.string().min(10).max(20_000),
        notes: z.string().max(500).optional(),
        activate: z.boolean().default(false),
      })
      .parse(request.body);

    const versions = await services.repos.prompts.listVersions(name);
    if (versions.length === 0) throw new NotFoundError('Prompt');
    const nextVersion = Math.max(...versions.map((v) => v.version)) + 1;

    const variables = [...new Set([...body.systemPrompt.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]!)),
      ...new Set([...body.userTemplate.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]!))];

    const created = await services.repos.prompts.create({
      userId: user.role === 'ADMIN' ? null : user.id,
      name,
      version: nextVersion,
      provider: null,
      systemPrompt: body.systemPrompt,
      userTemplate: body.userTemplate,
      variables: [...new Set(variables)],
      active: false,
      notes: body.notes ?? null,
    });
    if (body.activate) await services.repos.prompts.activate(created.id);
    services.prompts.invalidate();

    return reply.status(201).send({ prompt: created });
  });

  app.post('/api/prompts/versions/:id/activate', async (request) => {
    requireUser(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const activated = await services.repos.prompts.activate(id);
    services.prompts.invalidate();
    return { prompt: activated };
  });

  // ── content templates (spec §39) ─────────────────────────────────────────

  app.get('/api/templates', async (request) => {
    const user = requireUser(request);
    return { templates: await services.repos.contentTemplates.listByUser(user.id) };
  });

  app.post('/api/templates', async (request, reply) => {
    const user = requireUser(request);
    const body = z
      .object({
        name: z.string().min(1).max(80),
        description: z.string().max(400).optional(),
        scriptStructure: z.record(z.unknown()),
        visualStyle: z.string().max(300),
        musicMood: z.string().max(100).optional(),
        sceneDurationSec: z.number().min(2).max(30).default(7),
        thumbnailStyle: z.string().max(300).optional(),
      })
      .parse(request.body);

    const template = await services.repos.contentTemplates.create({
      userId: user.id,
      name: body.name,
      description: body.description ?? null,
      scriptStructure: body.scriptStructure,
      visualStyle: body.visualStyle,
      voiceProfile: null,
      musicMood: body.musicMood ?? null,
      sceneDurationSec: body.sceneDurationSec,
      thumbnailStyle: body.thumbnailStyle ?? null,
      isSystem: false,
    });
    return reply.status(201).send({ template });
  });

  app.delete('/api/templates/:id', async (request) => {
    const user = requireUser(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const template = await services.repos.contentTemplates.findById(id);
    if (!template || template.userId !== user.id) throw new NotFoundError('Template');
    await services.repos.contentTemplates.delete(id);
    return { ok: true };
  });

  // ── notifications (spec §48) ─────────────────────────────────────────────

  app.get('/api/notifications/targets', async (request) => {
    const user = requireUser(request);
    return {
      targets: await services.repos.notifications.listByUser(user.id),
      channels: services.notifier.available(),
    };
  });

  app.post('/api/notifications/targets', async (request, reply) => {
    const user = requireUser(request);
    const body = z
      .object({
        kind: z.enum(['email', 'telegram', 'discord', 'slack', 'memory']),
        target: z.string().min(1).max(400),
        events: z.array(z.string().max(40)).default([]),
      })
      .parse(request.body);
    const target = await services.repos.notifications.create({ ...body, userId: user.id, enabled: true });
    return reply.status(201).send({ target });
  });

  app.delete('/api/notifications/targets/:id', async (request) => {
    const user = requireUser(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const targets = await services.repos.notifications.listByUser(user.id);
    if (!targets.some((t) => t.id === id)) throw new NotFoundError('Notification target');
    await services.repos.notifications.delete(id);
    return { ok: true };
  });

  // ── admin (spec §40) ─────────────────────────────────────────────────────

  app.get('/api/admin/stats', async (request) => {
    requireAdmin(request);
    const now = services.clock.now();
    const { start, end } = monthWindow(now);
    const [users, channels, videos, jobCounts, errors, monthly] = await Promise.all([
      services.repos.users.count(),
      services.repos.channels.count(),
      services.repos.videos.count(),
      services.repos.jobs.countByState(),
      services.repos.jobs.listErrors(25),
      services.costReporter.monthly(start, end),
    ]);

    const published = await services.repos.videos.listByStatus('PUBLISHED', 1000);
    const queues = await Promise.all(
      ['pipeline', 'discovery', 'analytics', 'maintenance'].map(async (queue) => ({
        queue,
        counts: await services.queue.counts(queue).catch(() => null),
      })),
    );

    return {
      totals: { users, channels, videos, published: published.length },
      cost: { month: monthly.total, byProvider: monthly.byProvider },
      jobs: { byState: jobCounts, queues },
      errors: errors.map((e) => ({ jobId: e.jobId, attempt: e.attempt, message: e.message, createdAt: e.createdAt })),
      providers: (await services.registry.healthAll()).map((p) => ({
        key: p.key,
        configured: p.configured,
        healthy: p.health.ok,
      })),
    };
  });

  app.get('/api/admin/users', async (request) => {
    requireAdmin(request);
    const users = await services.repos.users.list(100);
    return {
      users: await Promise.all(
        users.map(async (user) => ({
          id: user.id,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
          channels: (await services.repos.channels.listByUser(user.id)).length,
        })),
      ),
    };
  });
}

function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
