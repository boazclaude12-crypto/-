import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../../services/container.js';
import { requireChannel, requireUser, requireVideo } from '../middleware/auth.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors.js';
import { PIPELINE_STAGES, VideoStateMachine } from '../../pipeline/state-machine.js';
import { VIDEO_STATUSES } from '../../shared/types.js';
import { scoreIdea } from '../../shared/scoring.js';
import { resumePoint } from '../../pipeline/runner.js';
import { generationLimit } from '../middleware/limits.js';

export async function contentRoutes(app: FastifyInstance, services: AppServices): Promise<void> {
  // ── ideas (spec §10, §11) ────────────────────────────────────────────────

  app.get('/api/ideas', async (request) => {
    const query = z
      .object({
        channelId: z.string(),
        status: z.enum(['PROPOSED', 'APPROVED', 'REJECTED', 'IN_PRODUCTION', 'PRODUCED']).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(request.query);
    const { channel } = await requireChannel(services, request, query.channelId);
    const ideas = await services.repos.ideas.listByChannel(channel.id, {
      status: query.status,
      limit: query.limit,
    });
    return { ideas };
  });

  app.post('/api/ideas/generate', generationLimit, async (request) => {
    const body = z
      .object({ channelId: z.string(), count: z.number().int().min(1).max(20).default(5), useStoredSignals: z.boolean().default(false) })
      .parse(request.body);
    const { channel, settings } = await requireChannel(services, request, body.channelId);

    const budget = await services.budget.status(channel.id);
    if (budget.blocked) {
      throw new ConflictError(
        `The monthly budget for this channel is exhausted ($${budget.spentUsd.toFixed(2)} of $${budget.budgetUsd.toFixed(2)}). Raise it on the Costs screen to continue.`,
      );
    }

    const result = await services.ideas.generate(channel, settings, {
      count: body.count,
      useStoredSignals: body.useStoredSignals,
    });
    return { ideas: result.ideas, signalsUsed: result.signalsUsed, competitorTopics: result.competitorTopics };
  });

  app.post('/api/ideas/:ideaId/approve', async (request) => {
    const { ideaId } = z.object({ ideaId: z.string() }).parse(request.params);
    const idea = await services.repos.ideas.findById(ideaId);
    if (!idea) throw new NotFoundError('Idea');
    await requireChannel(services, request, idea.channelId);
    return { idea: await services.repos.ideas.update(ideaId, { status: 'APPROVED' }) };
  });

  app.post('/api/ideas/:ideaId/reject', async (request) => {
    const { ideaId } = z.object({ ideaId: z.string() }).parse(request.params);
    const idea = await services.repos.ideas.findById(ideaId);
    if (!idea) throw new NotFoundError('Idea');
    await requireChannel(services, request, idea.channelId);
    return { idea: await services.repos.ideas.update(ideaId, { status: 'REJECTED' }) };
  });

  app.patch('/api/ideas/:ideaId', async (request) => {
    const { ideaId } = z.object({ ideaId: z.string() }).parse(request.params);
    const idea = await services.repos.ideas.findById(ideaId);
    if (!idea) throw new NotFoundError('Idea');
    const { settings } = await requireChannel(services, request, idea.channelId);

    const body = z
      .object({
        title: z.string().min(3).max(160).optional(),
        topic: z.string().min(3).max(200).optional(),
        angle: z.string().min(3).max(500).optional(),
        hook: z.string().min(3).max(500).optional(),
      })
      .parse(request.body);

    // Editing an idea keeps its scores but re-derives the overall, so the ranking stays honest.
    const breakdown = scoreIdea(idea, (settings.ideaWeights as never) ?? undefined);
    return {
      idea: await services.repos.ideas.update(ideaId, {
        ...body,
        overallScore: breakdown.overall,
        scoreBreakdown: breakdown as unknown as Record<string, unknown>,
      }),
    };
  });

  app.post('/api/ideas/:ideaId/produce', generationLimit, async (request, reply) => {
    const { ideaId } = z.object({ ideaId: z.string() }).parse(request.params);
    const body = z
      .object({ templateId: z.string().optional(), targetDurationSec: z.number().int().min(60).max(3600).optional() })
      .parse(request.body ?? {});

    const idea = await services.repos.ideas.findById(ideaId);
    if (!idea) throw new NotFoundError('Idea');
    const { channel } = await requireChannel(services, request, idea.channelId);

    const budget = await services.budget.status(channel.id);
    if (budget.blocked) throw new ConflictError('The monthly budget for this channel is exhausted.');

    const result = await services.production.startFromIdea(ideaId, body);
    return reply.status(201).send({ video: result.video, jobId: result.jobId, reason: result.reason });
  });

  // ── videos (spec §7, §60) ────────────────────────────────────────────────

  app.get('/api/videos', async (request) => {
    const query = z
      .object({
        channelId: z.string(),
        status: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(25),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query);
    const { channel } = await requireChannel(services, request, query.channelId);

    const statuses = query.status
      ? query.status.split(',').filter((s): s is (typeof VIDEO_STATUSES)[number] => VIDEO_STATUSES.includes(s as never))
      : undefined;

    const page = await services.repos.videos.listByChannel(channel.id, {
      status: statuses,
      limit: query.limit,
      offset: query.offset,
    });
    return {
      ...page,
      items: page.items.map((video) => ({
        ...video,
        completion: VideoStateMachine.completion(video.status),
      })),
    };
  });

  app.get('/api/videos/:videoId', async (request) => {
    const { videoId } = z.object({ videoId: z.string() }).parse(request.params);
    const { video, channel } = await requireVideo(services, request, videoId);

    const [research, script, scenes, assets, voiceovers, thumbnails, seo, qc, upload, schedule, analytics, decisions, jobs, agentRuns, timeline, usage] =
      await Promise.all([
        services.repos.research.findByVideo(videoId),
        services.repos.scripts.findByVideo(videoId),
        services.repos.scenes.listByVideo(videoId),
        services.repos.assets.listByVideo(videoId),
        services.repos.voiceovers.listByVideo(videoId),
        services.repos.thumbnails.listByVideo(videoId),
        services.repos.seo.findByVideo(videoId),
        services.repos.qc.listByVideo(videoId),
        services.repos.uploads.findByVideo(videoId),
        services.repos.schedules.findByVideo(videoId),
        services.repos.analytics.listByVideo(videoId),
        services.repos.decisions.listByVideo(videoId),
        services.repos.jobs.listByVideo(videoId),
        services.repos.agentRuns.listByVideo(videoId),
        services.repos.timelines.findByVideo(videoId),
        services.repos.usage.sumForVideo(videoId),
      ]);

    return {
      video: { ...video, completion: VideoStateMachine.completion(video.status) },
      channel: { id: channel.id, name: channel.name, youtubeChannelId: channel.youtubeChannelId },
      // Stages the video has already moved past report 100%, even though they had no
      // long-running step of their own — otherwise a finished video shows "Research
      // complete 0%", which reads as "never happened".
      stages: PIPELINE_STAGES.map((stage, index) => {
        const currentIndex = PIPELINE_STAGES.findIndex((s) => s.status === video.status);
        const recorded = (video.progress as Record<string, number> | null)?.[stage.status];
        const passed = currentIndex > index;
        return {
          ...stage,
          percent: recorded ?? (passed ? 100 : 0),
          reached: currentIndex >= index,
        };
      }),
      research,
      script,
      scenes,
      assets: assets.map((a) => ({ ...a, url: services.storage.url(a.storageKey) })),
      voiceovers,
      thumbnails: thumbnails.map((t) => ({ ...t, url: t.storageKey ? services.storage.url(t.storageKey) : null })),
      seo,
      qc,
      upload,
      schedule,
      analytics,
      decisions,
      jobs,
      agentRuns: agentRuns.map((r) => ({ ...r, input: undefined })),
      timeline: timeline?.document ?? null,
      renderCommand: timeline?.renderCmd ?? null,
      costUsd: usage,
      renderUrl: video.renderKey ? services.storage.url(video.renderKey) : null,
    };
  });

  app.post('/api/videos/:videoId/advance', async (request) => {
    const { videoId } = z.object({ videoId: z.string() }).parse(request.params);
    const { video } = await requireVideo(services, request, videoId);
    // The HTTP process never runs a step itself (spec §69) — it only enqueues.
    const jobId = await services.runner.enqueue(video.id, { reason: 'manual advance', expectStatus: video.status });
    return { jobId, status: video.status };
  });

  app.post('/api/videos/:videoId/approve', async (request) => {
    const { videoId } = z.object({ videoId: z.string() }).parse(request.params);
    const { video } = await requireVideo(services, request, videoId);
    await services.production.approve(video.id);
    return { ok: true, status: video.status };
  });

  app.post('/api/videos/:videoId/reject', async (request) => {
    const { videoId } = z.object({ videoId: z.string() }).parse(request.params);
    const body = z.object({ reason: z.string().min(1).max(500) }).parse(request.body ?? { reason: 'Rejected by user' });
    const { video } = await requireVideo(services, request, videoId);
    return { video: await services.production.reject(video.id, body.reason) };
  });

  app.post('/api/videos/:videoId/retry', async (request) => {
    const { videoId } = z.object({ videoId: z.string() }).parse(request.params);
    const body = z.object({ from: z.enum(VIDEO_STATUSES).optional() }).parse(request.body ?? {});
    const { video } = await requireVideo(services, request, videoId);
    if (video.status !== 'FAILED' && !body.from) {
      throw new ValidationError('Only a failed video can be retried without an explicit stage');
    }

    const target = body.from ?? resumePoint(video.previousStatus ?? 'IDEA');
    if (!VideoStateMachine.canTransition(video.status, target)) {
      throw new ValidationError(`Cannot restart a ${video.status} video from ${target}`);
    }
    await services.repos.videos.update(video.id, { status: target, failureReason: null });
    const jobId = await services.runner.enqueue(video.id, { reason: 'manual retry', expectStatus: target });
    return { jobId, from: target };
  });

  app.post('/api/videos/:videoId/qc', async (request) => {
    const { videoId } = z.object({ videoId: z.string() }).parse(request.params);
    const { video } = await requireVideo(services, request, videoId);
    if (!video.renderKey) throw new ValidationError('This video has not been rendered yet');
    await services.repos.videos.update(video.id, { status: 'QC' });
    const jobId = await services.runner.enqueue(video.id, { reason: 'manual qc', expectStatus: 'QC' });
    return { jobId };
  });

  app.post('/api/videos/:videoId/schedule', async (request) => {
    const { videoId } = z.object({ videoId: z.string() }).parse(request.params);
    const body = z.object({ publishAt: z.coerce.date().optional() }).parse(request.body ?? {});
    const { video, channel } = await requireVideo(services, request, videoId);

    const qc = await services.repos.qc.latest(video.id);
    if (!qc?.passed) throw new ConflictError('A video must pass quality control before it can be scheduled');

    if (body.publishAt) {
      if (body.publishAt.getTime() <= services.clock.now().getTime()) {
        throw new ValidationError('A scheduled publish time must be in the future');
      }
      const existing = await services.repos.schedules.findByVideo(video.id);
      const settings = await services.repos.channelSettings.findByChannel(channel.id);
      const slot = existing
        ? await services.repos.schedules.update(existing.id, { publishAt: body.publishAt, reserved: true })
        : await services.repos.schedules.create({
            channelId: channel.id,
            videoId: video.id,
            publishAt: body.publishAt,
            timezone: settings?.timezone ?? 'UTC',
            reserved: true,
          });
      await services.repos.videos.update(video.id, { status: 'SCHEDULED', publishAt: body.publishAt });
      return { slot, publishAt: body.publishAt, reason: 'Scheduled manually.' };
    }

    const assignment = await services.scheduler.reserve(channel.id, video.id);
    await services.repos.videos.update(video.id, { status: 'SCHEDULED' });
    return assignment;
  });

  app.post('/api/videos/:videoId/upload', async (request) => {
    const { videoId } = z.object({ videoId: z.string() }).parse(request.params);
    const { video } = await requireVideo(services, request, videoId);
    if (video.status !== 'SCHEDULED') {
      throw new ConflictError(`A video must be scheduled before it can be uploaded (it is ${video.status})`);
    }
    const jobId = await services.runner.enqueue(video.id, { reason: 'manual upload', expectStatus: 'SCHEDULED' });
    return { jobId };
  });

  app.post('/api/videos/:videoId/thumbnail', async (request) => {
    const { videoId } = z.object({ videoId: z.string() }).parse(request.params);
    const body = z.object({ variant: z.string().min(1).max(4) }).parse(request.body);
    const { video } = await requireVideo(services, request, videoId);

    const thumbnails = await services.repos.thumbnails.listByVideo(video.id);
    const chosen = thumbnails.find((t) => t.variant === body.variant);
    if (!chosen) throw new NotFoundError('Thumbnail variant');
    if (!chosen.storageKey) throw new ValidationError('That variant has no rendered image');

    const selected = await services.repos.thumbnails.select(video.id, body.variant);
    await services.repos.decisions.record({
      videoId: video.id,
      channelId: video.channelId,
      subject: 'Thumbnail selection',
      decision: `Variant ${body.variant}`,
      reason: 'Chosen manually by the channel owner.',
      score: selected.ctrPotential,
      dataUsed: { variants: thumbnails.map((t) => ({ variant: t.variant, score: t.ctrPotential })) },
    });
    return { thumbnail: selected };
  });

  app.patch('/api/videos/:videoId/seo', async (request) => {
    const { videoId } = z.object({ videoId: z.string() }).parse(request.params);
    const body = z
      .object({
        title: z.string().min(3).max(100).optional(),
        description: z.string().max(4800).optional(),
        tags: z.array(z.string().max(40)).max(40).optional(),
      })
      .parse(request.body);
    const { video } = await requireVideo(services, request, videoId);

    const existing = await services.repos.seo.findByVideo(video.id);
    if (!existing) throw new NotFoundError('SEO metadata');

    const updated = await services.repos.seo.upsert(video.id, {
      title: body.title ?? existing.title,
      titleCandidates: existing.titleCandidates,
      description: body.description ?? existing.description,
      tags: body.tags ?? existing.tags,
      hashtags: existing.hashtags,
      keywords: existing.keywords,
      chapters: existing.chapters,
      categoryId: existing.categoryId,
    });
    if (body.title) await services.repos.videos.update(video.id, { title: body.title });
    return { seo: updated };
  });

  app.delete('/api/videos/:videoId', async (request) => {
    const { videoId } = z.object({ videoId: z.string() }).parse(request.params);
    const { video } = await requireVideo(services, request, videoId);
    await services.repos.videos.delete(video.id);
    return { ok: true };
  });

  // ── on-demand production (spec §61) ──────────────────────────────────────

  app.post('/api/channels/:channelId/generate-video', generationLimit, async (request, reply) => {
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const { channel, settings } = await requireChannel(services, request, channelId);

    const budget = await services.budget.status(channel.id);
    if (budget.blocked) throw new ConflictError('The monthly budget for this channel is exhausted.');

    let idea = await services.ideas.pickBest(channel.id, settings);
    if (!idea) {
      const generated = await services.ideas.generate(channel, settings, { count: 5, autoApprove: true });
      idea = [...generated.ideas].sort((a, b) => b.overallScore - a.overallScore)[0] ?? null;
    }
    if (!idea) throw new ConflictError('No idea could be generated for this channel');

    const result = await services.production.startFromIdea(idea.id);
    return reply.status(201).send({ video: result.video, idea, jobId: result.jobId, reason: result.reason });
  });

  // ── research / scripts (spec §65) ────────────────────────────────────────

  app.get('/api/research/:videoId', async (request) => {
    const { videoId } = z.object({ videoId: z.string() }).parse(request.params);
    await requireVideo(services, request, videoId);
    const research = await services.repos.research.findByVideo(videoId);
    if (!research) throw new NotFoundError('Research');
    return { research };
  });

  app.post('/api/research/:videoId/run', async (request) => {
    const { videoId } = z.object({ videoId: z.string() }).parse(request.params);
    const { video } = await requireVideo(services, request, videoId);
    await services.repos.videos.update(video.id, { status: 'IDEA' });
    const jobId = await services.runner.enqueue(video.id, { reason: 'manual research', expectStatus: 'IDEA' });
    return { jobId };
  });

  app.get('/api/scripts/:videoId', async (request) => {
    const { videoId } = z.object({ videoId: z.string() }).parse(request.params);
    await requireVideo(services, request, videoId);
    const script = await services.repos.scripts.findByVideo(videoId);
    if (!script) throw new NotFoundError('Script');
    return { script };
  });

  app.post('/api/scripts/generate', async (request) => {
    const body = z.object({ videoId: z.string() }).parse(request.body);
    const { video } = await requireVideo(services, request, body.videoId);
    await services.repos.videos.update(video.id, { status: 'RESEARCH_COMPLETE' });
    const jobId = await services.runner.enqueue(video.id, { reason: 'manual script', expectStatus: 'RESEARCH_COMPLETE' });
    return { jobId };
  });

  // ── calendar (spec §56) ──────────────────────────────────────────────────

  app.get('/api/calendar', async (request) => {
    const query = z
      .object({ channelId: z.string(), from: z.coerce.date().optional(), to: z.coerce.date().optional() })
      .parse(request.query);
    const { channel } = await requireChannel(services, request, query.channelId);

    const from = query.from ?? new Date(services.clock.now().getTime() - 14 * 86_400_000);
    const to = query.to ?? new Date(services.clock.now().getTime() + 45 * 86_400_000);

    const [slots, videos] = await Promise.all([
      services.repos.schedules.listByChannel(channel.id, from, to),
      services.repos.videos.listByChannel(channel.id, { limit: 200 }),
    ]);
    const byId = new Map(videos.items.map((v) => [v.id, v]));

    return {
      from,
      to,
      entries: [
        ...slots.map((slot) => ({
          kind: 'slot' as const,
          date: slot.publishAt,
          videoId: slot.videoId,
          title: slot.videoId ? byId.get(slot.videoId)?.title ?? null : null,
          status: slot.videoId ? byId.get(slot.videoId)?.status ?? null : null,
        })),
        ...videos.items
          .filter((v) => v.publishedAt && v.publishedAt >= from && v.publishedAt <= to)
          .map((v) => ({ kind: 'published' as const, date: v.publishedAt!, videoId: v.id, title: v.title, status: v.status })),
      ].sort((a, b) => a.date.getTime() - b.date.getTime()),
    };
  });

  app.patch('/api/calendar/:videoId', async (request) => {
    const { videoId } = z.object({ videoId: z.string() }).parse(request.params);
    const body = z.object({ publishAt: z.coerce.date() }).parse(request.body);
    const { video, channel } = await requireVideo(services, request, videoId);

    if (body.publishAt.getTime() <= services.clock.now().getTime()) {
      throw new ValidationError('A publish time must be in the future');
    }
    if (video.status === 'PUBLISHED') throw new ConflictError('This video is already published');

    const settings = await services.repos.channelSettings.findByChannel(channel.id);
    const existing = await services.repos.schedules.findByVideo(video.id);
    const slot = existing
      ? await services.repos.schedules.update(existing.id, { publishAt: body.publishAt })
      : await services.repos.schedules.create({
          channelId: channel.id,
          videoId: video.id,
          publishAt: body.publishAt,
          timezone: settings?.timezone ?? 'UTC',
          reserved: true,
        });
    await services.repos.videos.update(video.id, { publishAt: body.publishAt });
    return { slot };
  });
}
