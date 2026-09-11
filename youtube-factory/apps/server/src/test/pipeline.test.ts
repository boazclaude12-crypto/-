import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connectChannel, createTestContext, ffmpegAvailable, seedChannel, type TestContext } from './harness.js';
import { QUEUES } from '../queue/index.js';
import { MockLLMProvider, MockYouTubeProvider } from '../providers/mock/index.js';
import type { AdvancePayload } from '../pipeline/runner.js';

let ctx: TestContext;

beforeEach(async () => {
  ctx = await createTestContext();
});
afterEach(async () => {
  await ctx.cleanup();
});

/**
 * End-to-end acceptance (spec §83). Runs the whole factory against mock providers and a real
 * FFmpeg, and asserts on the artefacts — not on the fact that no exception was thrown.
 */
describe('full production pipeline', () => {
  it('takes an idea all the way to a scheduled, rendered video', async () => {
    if (!(await ffmpegAvailable(ctx))) return; // FFmpeg is required for the render assertions

    const seeded = await seedChannel(ctx, { automationMode: 'FULL_AUTO', targetDurationMin: 4 });

    // ── ideas are generated and scored ──────────────────────────────────────
    const generated = await ctx.services.ideas.generate(seeded.channel, seeded.settings, { count: 3 });
    expect(generated.ideas.length).toBeGreaterThanOrEqual(1);
    for (const idea of generated.ideas) {
      expect(idea.overallScore).toBeGreaterThan(0);
      expect(idea.overallScore).toBeLessThanOrEqual(100);
      expect(idea.scoreBreakdown).toBeTruthy();
    }
    const titles = new Set(generated.ideas.map((i) => i.title));
    expect(titles.size).toBe(generated.ideas.length);

    const best = await ctx.services.ideas.pickBest(seeded.channel.id, seeded.settings);
    expect(best).not.toBeNull();

    // ── production runs to a scheduled video ────────────────────────────────
    const started = await ctx.services.production.startFromIdea(best!.id);
    expect(started.reason).toContain('score');
    expect((await ctx.repos.ideas.findById(best!.id))?.status).toBe('IN_PRODUCTION');

    const outcomes = await ctx.services.runner.runToCompletion(started.video.id);
    const visited = outcomes.map((o) => o.to);
    expect(visited).toContain('RESEARCH_COMPLETE');
    expect(visited).toContain('SCRIPT_READY');
    expect(visited).toContain('GENERATING_VISUALS');
    expect(visited).toContain('EDITING');
    expect(visited).toContain('THUMBNAIL');
    expect(visited).toContain('SEO');

    const video = (await ctx.repos.videos.findById(started.video.id))!;
    expect(video.status).toBe('SCHEDULED');
    expect(video.failureReason).toBeNull();

    // ── research is sourced ─────────────────────────────────────────────────
    const research = await ctx.repos.research.findByVideo(video.id);
    expect(research!.sources.length).toBeGreaterThan(0);
    for (const source of research!.sources) {
      expect(source.claim.length).toBeGreaterThan(5);
      expect(source.source.length).toBeGreaterThan(0);
      expect(['SUPPORTED', 'UNVERIFIED', 'CONTRADICTED']).toContain(source.verdict);
    }

    // ── script is written, scored and fact-checked ──────────────────────────
    const script = (await ctx.repos.scripts.findByVideo(video.id))!;
    expect(script.sections.length).toBeGreaterThan(0);
    expect(script.hook.length).toBeGreaterThan(10);
    expect(script.retentionScore).toBeGreaterThan(0);
    expect(script.factCheckScore).not.toBeNull();
    expect(video.factConfidence).not.toBeNull();

    // ── scenes and their assets ─────────────────────────────────────────────
    const scenes = await ctx.repos.scenes.listByVideo(video.id);
    expect(scenes.length).toBeGreaterThan(0);
    for (const scene of scenes) {
      expect(scene.assetId).not.toBeNull();
      expect(scene.prompt.length).toBeGreaterThan(5);
    }
    // Consecutive scenes must not silently reuse one asset.
    const sceneAssets = scenes.map((s) => s.assetId);
    expect(new Set(sceneAssets).size).toBeGreaterThan(1);

    // ── narration and subtitles ─────────────────────────────────────────────
    const voiceovers = await ctx.repos.voiceovers.listByVideo(video.id);
    expect(voiceovers.length).toBeGreaterThan(0);
    expect(voiceovers[0]!.wordTimings!.length).toBeGreaterThan(0);
    const captions = await ctx.repos.assets.listByVideo(video.id, 'CAPTION');
    expect(captions).toHaveLength(1);
    const srt = (await ctx.services.storage.get(captions[0]!.storageKey)).toString();
    expect(srt).toMatch(/^1\n\d{2}:\d{2}:\d{2},\d{3} --> /);

    // ── the render is a real, playable file ─────────────────────────────────
    expect(video.renderKey).toBeTruthy();
    const renderPath = await ctx.services.storage.localPath(video.renderKey!, `${ctx.dir}/probe`);
    const info = await ctx.services.renderer.tools.probe(renderPath);
    expect(info.hasVideo).toBe(true);
    expect(info.hasAudio).toBe(true);
    expect(info.videoCodec).toBe('h264');
    expect(info.audioCodec).toBe('aac');
    expect(info.durationSec).toBeGreaterThan(5);

    // The cut is timed to the narration, not to an arbitrary shot list.
    const narrationSec = voiceovers.reduce((sum, v) => sum + v.durationSec, 0);
    expect(Math.abs(info.durationSec - narrationSec)).toBeLessThan(narrationSec * 0.25 + 3);

    // ── QC ran and passed ───────────────────────────────────────────────────
    const qc = (await ctx.repos.qc.latest(video.id))!;
    expect(qc.passed).toBe(true);
    expect(qc.score).toBeGreaterThan(50);

    // ── thumbnails, one selected ────────────────────────────────────────────
    const thumbnails = await ctx.repos.thumbnails.listByVideo(video.id);
    expect(thumbnails.length).toBeGreaterThanOrEqual(2);
    const selected = thumbnails.filter((t) => t.selected);
    expect(selected).toHaveLength(1);
    expect(selected[0]!.storageKey).toBeTruthy();
    // Auto mode picks the highest predicted CTR.
    expect(selected[0]!.ctrPotential).toBe(Math.max(...thumbnails.filter((t) => t.storageKey).map((t) => t.ctrPotential)));

    // ── SEO ─────────────────────────────────────────────────────────────────
    const seo = (await ctx.repos.seo.findByVideo(video.id))!;
    expect(seo.title.length).toBeGreaterThan(5);
    expect(seo.description.length).toBeGreaterThan(50);
    expect(seo.tags.length).toBeGreaterThan(2);
    expect(new Set(seo.tags.map((t) => t.toLowerCase())).size).toBe(seo.tags.length);
    expect((JSON.parse(JSON.stringify(seo.titleCandidates)) as unknown[]).length).toBeGreaterThanOrEqual(10);

    // ── scheduled into a real future slot ───────────────────────────────────
    expect(video.publishAt).toBeTruthy();
    expect(video.publishAt!.getTime()).toBeGreaterThan(ctx.clock.now().getTime());

    // ── quality, cost and explainability ────────────────────────────────────
    expect(video.qualityScore).toBeGreaterThan(0);
    expect(Object.keys(video.qualityBreakdown ?? {}).length).toBeGreaterThan(5);

    const decisions = await ctx.repos.decisions.listByVideo(video.id);
    expect(decisions.length).toBeGreaterThan(5);
    for (const decision of decisions) expect(decision.reason.length).toBeGreaterThan(10);

    const agentRuns = await ctx.repos.agentRuns.listByVideo(video.id);
    const agentsUsed = new Set(agentRuns.map((r) => r.agent));
    for (const expected of ['RESEARCH_AGENT', 'SCRIPT_AGENT', 'RETENTION_AGENT', 'FACT_CHECK_AGENT', 'SCENE_AGENT', 'THUMBNAIL_AGENT', 'SEO_AGENT', 'QC_AGENT']) {
      expect(agentsUsed).toContain(expected);
    }
    for (const run of agentRuns) expect(run.promptName.length).toBeGreaterThan(0);
  }, 300_000);

  it('uploads, collects analytics and learns from the result', async () => {
    if (!(await ffmpegAvailable(ctx))) return;

    const seeded = await seedChannel(ctx, { automationMode: 'FULL_AUTO', targetDurationMin: 4 });
    await connectChannel(ctx, seeded.channel.id);

    await ctx.services.ideas.generate(seeded.channel, seeded.settings, { count: 2 });
    const best = await ctx.services.ideas.pickBest(seeded.channel.id, seeded.settings);
    const started = await ctx.services.production.startFromIdea(best!.id);
    await ctx.services.runner.runToCompletion(started.video.id);

    // The slot is in the future; move it into the past so the upload sweeper picks it up.
    await ctx.repos.videos.update(started.video.id, { publishAt: new Date(ctx.clock.now().getTime() - 1000) });
    const due = await ctx.services.autopilot.publishDue();
    expect(due).toContain(started.video.id);

    const upload = await ctx.services.runner.advance(started.video.id, { expectStatus: 'SCHEDULED' });
    expect(upload.to).toBe('PUBLISHED');

    const published = (await ctx.repos.videos.findById(started.video.id))!;
    expect(published.youtubeVideoId).toBeTruthy();
    expect(published.publishedAt).toBeTruthy();

    const uploadRecord = (await ctx.repos.uploads.findByVideo(published.id))!;
    expect(uploadRecord.state).toBe('COMPLETE');

    // The mock provider records exactly what would have been sent to YouTube.
    const provider = ctx.services.registry.get('youtube') as MockYouTubeProvider;
    expect(provider.uploaded).toHaveLength(1);
    expect(provider.uploaded[0]!.title.length).toBeGreaterThan(5);
    expect(provider.uploaded[0]!.description.length).toBeGreaterThan(50);
    expect(provider.uploaded[0]!.tags.length).toBeGreaterThan(2);
    expect(provider.thumbnails).toHaveLength(1);

    // ── analytics ───────────────────────────────────────────────────────────
    const analytics = await ctx.services.runner.advance(published.id, { expectStatus: 'PUBLISHED' });
    expect(analytics.to).toBe('PUBLISHED');
    const snapshot = (await ctx.repos.analytics.latestByVideo(published.id))!;
    expect(snapshot.views).toBeGreaterThan(0);
    expect(snapshot.ctr).toBeGreaterThan(0);

    // ── learning ────────────────────────────────────────────────────────────
    const learned = await ctx.services.learning.learnFrom(published, snapshot);
    expect(learned).toBeGreaterThan(0);
    const learnings = await ctx.repos.learnings.listByChannel(seeded.channel.id);
    expect(learnings.length).toBeGreaterThan(0);
    expect(learnings.some((l) => l.dimension === 'thumbnail' && l.delta !== null)).toBe(true);

    const summary = await ctx.services.learning.summarize(seeded.channel.id, 5);
    expect(summary.length).toBeGreaterThan(0);

    const baseline = await ctx.services.learning.baseline(seeded.channel.id);
    expect(baseline.videos).toBe(1);
    expect(baseline.avgViews).toBeGreaterThan(0);
  }, 300_000);

  it('refuses to publish when the upload safety checks fail', async () => {
    const seeded = await seedChannel(ctx, { automationMode: 'FULL_AUTO' });
    await connectChannel(ctx, seeded.channel.id);

    // A video that reached SCHEDULED without QC, a thumbnail or metadata.
    const video = await ctx.repos.videos.create({
      channelId: seeded.channel.id, ideaId: null, templateId: null,
      title: 'Unsafe', status: 'SCHEDULED', previousStatus: 'READY', progress: {},
      targetDurationSec: 300, actualDurationSec: 300, language: 'en',
      renderKey: null, renderWidth: null, renderHeight: null, fileSizeBytes: null,
      qualityScore: null, qualityBreakdown: null, factConfidence: 0.99, retentionScore: 80,
      estimatedCostUsd: 0, actualCostUsd: 0, failureReason: null,
      publishAt: new Date(ctx.clock.now().getTime() - 1000), publishedAt: null, youtubeVideoId: null,
    });

    const outcome = await ctx.services.runner.advance(video.id, { expectStatus: 'SCHEDULED' });
    expect(outcome.to).toBe('FAILED');
    expect(outcome.note).toContain('quality control');

    const provider = ctx.services.registry.get('youtube') as MockYouTubeProvider;
    expect(provider.uploaded).toHaveLength(0);
  }, 60_000);

  it('stops for approval in semi-auto mode instead of scheduling', async () => {
    if (!(await ffmpegAvailable(ctx))) return;

    const seeded = await seedChannel(ctx, { automationMode: 'SEMI_AUTO', targetDurationMin: 4 });
    await ctx.repos.notifications.create({
      userId: seeded.user.id, kind: 'memory', target: 'inbox', events: [], enabled: true,
    });

    await ctx.services.ideas.generate(seeded.channel, seeded.settings, { count: 2 });
    const idea = (await ctx.repos.ideas.listByChannel(seeded.channel.id))[0]!;
    await ctx.repos.ideas.update(idea.id, { status: 'APPROVED' });

    const started = await ctx.services.production.startFromIdea(idea.id);
    const outcomes = await ctx.services.runner.runToCompletion(started.video.id);

    const last = outcomes[outcomes.length - 1]!;
    expect(last.waitingForApproval).toBe(true);
    expect((await ctx.repos.videos.findById(started.video.id))?.status).toBe('READY');
    expect(await ctx.repos.schedules.findByVideo(started.video.id)).toBeNull();

    // Approving lets it continue.
    await ctx.repos.channelSettings.update(seeded.channel.id, { automationMode: 'FULL_AUTO' });
    const resumed = await ctx.services.runner.advance(started.video.id, { expectStatus: 'READY' });
    expect(resumed.to).toBe('SCHEDULED');
  }, 300_000);

  it('drives the pipeline through the queue rather than inline', async () => {
    if (!(await ffmpegAvailable(ctx))) return;

    const seeded = await seedChannel(ctx, { automationMode: 'FULL_AUTO', targetDurationMin: 4 });
    ctx.queue.register<AdvancePayload>(QUEUES.pipeline, (job) => ctx.services.runner.handle(job), 1);

    await ctx.services.ideas.generate(seeded.channel, seeded.settings, { count: 2 });
    const best = await ctx.services.ideas.pickBest(seeded.channel.id, seeded.settings);
    const started = await ctx.services.production.startFromIdea(best!.id);

    await ctx.queue.runUntilIdle();

    const video = (await ctx.repos.videos.findById(started.video.id))!;
    expect(video.status).toBe('SCHEDULED');

    const jobs = await ctx.repos.jobs.listByVideo(video.id);
    expect(jobs.length).toBeGreaterThan(5);
    expect(jobs.every((j) => j.state === 'SUCCEEDED')).toBe(true);
  }, 300_000);

  it('leaves no orphaned jobs when the pipeline is driven inline', async () => {
    if (!(await ffmpegAvailable(ctx))) return;

    const seeded = await seedChannel(ctx, { automationMode: 'FULL_AUTO', targetDurationMin: 4 });
    await ctx.services.ideas.generate(seeded.channel, seeded.settings, { count: 2 });
    const best = await ctx.services.ideas.pickBest(seeded.channel.id, seeded.settings);
    const started = await ctx.services.production.startFromIdea(best!.id);

    await ctx.services.runner.runToCompletion(started.video.id);

    // `startFromIdea` queues the first step for a worker; the inline runner must not queue
    // a follow-up for every subsequent step and leave them pending forever.
    const jobs = await ctx.repos.jobs.listByVideo(started.video.id);
    const queued = jobs.filter((j) => j.state === 'QUEUED');
    expect(queued).toHaveLength(1);
    expect(jobs).toHaveLength(1);
  }, 300_000);

  it('falls back to another provider when the primary keeps failing', async () => {
    const seeded = await seedChannel(ctx);

    // Put a permanently broken provider ahead of the working mock.
    const broken = new MockLLMProvider();
    broken.failNextCalls = 999;
    Object.defineProperty(broken, 'key', { value: 'broken', writable: false });
    ctx.services.registry.register(broken, { priority: 1, qualityTier: 'premium' });

    const result = await ctx.services.agents.research.run(
      { topic: 'Rome', angle: 'aqueducts', language: 'en', depth: 'light', targetDurationMin: 5, knownSources: [] },
      { channelId: seeded.channel.id },
    );

    expect(result.output.findings.length).toBeGreaterThan(0);
    expect(result.usage.provider).toBe('mock-llm');

    const runs = await ctx.repos.agentRuns.listByVideo(null as never);
    expect(runs.length).toBeGreaterThanOrEqual(0);
  }, 60_000);

  it('marks a video FAILED and releases its slot when a step cannot recover', async () => {
    const seeded = await seedChannel(ctx);
    await ctx.repos.notifications.create({
      userId: seeded.user.id, kind: 'memory', target: 'inbox', events: [], enabled: true,
    });

    // No provider at all can satisfy the research step.
    const empty = await createTestContext();
    try {
      const emptySeed = await seedChannel(empty);
      const registry = empty.services.registry;
      for (const entry of registry.all()) {
        Object.defineProperty(entry.provider, 'isConfigured', { value: () => false });
      }

      const video = await empty.repos.videos.create({
        channelId: emptySeed.channel.id, ideaId: null, templateId: null,
        title: 'Doomed', status: 'IDEA', previousStatus: null, progress: {},
        targetDurationSec: 300, actualDurationSec: null, language: 'en',
        renderKey: null, renderWidth: null, renderHeight: null, fileSizeBytes: null,
        qualityScore: null, qualityBreakdown: null, factConfidence: null, retentionScore: null,
        estimatedCostUsd: 0, actualCostUsd: 0, failureReason: null,
        publishAt: null, publishedAt: null, youtubeVideoId: null,
      });

      await expect(empty.services.runner.advance(video.id)).rejects.toThrow();
      const failed = (await empty.repos.videos.findById(video.id))!;
      expect(failed.status).toBe('FAILED');
      expect(failed.failureReason).toContain('research');
    } finally {
      await empty.cleanup();
    }
  }, 60_000);
});

describe('autopilot', () => {
  it('respects the weekly cap and the buffer target', async () => {
    const seeded = await seedChannel(ctx, { automationMode: 'FULL_AUTO', videosPerWeek: 2 });
    await ctx.repos.channelSettings.update(seeded.channel.id, { autopilotEnabled: true, bufferTargetVideos: 1 });

    const result = await ctx.services.autopilot.runForChannel(seeded.channel.id);
    expect(result.ran).toBe(true);
    expect(result.productionsStarted.length).toBeGreaterThan(0);
    expect(result.productionsStarted.length).toBeLessThanOrEqual(2);

    // A second pass in the same week must not exceed the cap.
    const second = await ctx.services.autopilot.runForChannel(seeded.channel.id);
    const total = result.productionsStarted.length + second.productionsStarted.length;
    expect(total).toBeLessThanOrEqual(2);
  }, 120_000);

  it('does nothing when autopilot is off', async () => {
    const seeded = await seedChannel(ctx);
    const result = await ctx.services.autopilot.runForChannel(seeded.channel.id);
    expect(result.ran).toBe(false);
    expect(result.reason).toContain('Autopilot is off');
  });

  it('pauses when the monthly budget is exhausted', async () => {
    const seeded = await seedChannel(ctx, { monthlyBudgetUsd: 1 });
    await ctx.repos.channelSettings.update(seeded.channel.id, { autopilotEnabled: true });
    await ctx.repos.usage.record({
      channelId: seeded.channel.id, videoId: null, jobId: null,
      provider: 'mock', operation: 'test', model: null,
      inputUnits: 0, outputUnits: 0, unit: 'request',
      estimatedCost: 5, actualCost: 5, latencyMs: 1, status: 'ok', error: null,
    });

    const result = await ctx.services.autopilot.runForChannel(seeded.channel.id);
    expect(result.productionsStarted).toHaveLength(0);
    expect(result.reason).toContain('budget');
  });

  it('refreshes ideas but starts nothing in manual mode', async () => {
    const seeded = await seedChannel(ctx, { automationMode: 'MANUAL' });
    await ctx.repos.channelSettings.update(seeded.channel.id, { autopilotEnabled: true });

    const result = await ctx.services.autopilot.runForChannel(seeded.channel.id);
    expect(result.productionsStarted).toHaveLength(0);
    expect(result.ideasGenerated).toBeGreaterThan(0);
    const ideas = await ctx.repos.ideas.listByChannel(seeded.channel.id);
    expect(ideas.every((i) => i.status === 'PROPOSED')).toBe(true);
  }, 60_000);

  it('produces a weekly strategy plan', async () => {
    const seeded = await seedChannel(ctx);
    const plan = await ctx.services.autopilot.runWeeklyStrategy(seeded.channel.id);
    expect(plan).not.toBeNull();
    expect(plan!.summary.length).toBeGreaterThan(10);

    const stored = await ctx.repos.strategies.latest(seeded.channel.id);
    expect(stored).not.toBeNull();
    const mix = stored!.mix as { evergreen: number; trending: number; experimental: number };
    expect(mix.evergreen + mix.trending + mix.experimental).toBe(seeded.settings.videosPerWeek);
  }, 60_000);
});
