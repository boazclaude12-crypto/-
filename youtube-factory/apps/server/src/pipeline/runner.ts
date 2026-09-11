import { rm } from 'node:fs/promises';
import { createWorkDir } from '../media/ffmpeg.js';
import { QUEUES, type JobQueue, type QueueJob } from '../queue/index.js';
import { errorMessage, isRetryable, NotFoundError, PipelineError } from '../shared/errors.js';
import { newId } from '../shared/ids.js';
import { backoffDelay } from '../shared/retry.js';
import type { VideoStatus } from '../shared/types.js';
import type { PipelineDeps, PipelineStep, StepContext } from './context.js';
import { VideoStateMachine } from './state-machine.js';
import { factCheckStep, researchStep, scriptStep } from './steps/research.js';
import { scenePlanStep, visualsStep, voiceStep } from './steps/produce.js';
import { editStep, qcStep, seoStep, thumbnailStep } from './steps/finish.js';
import { analyticsStep, scheduleStep, uploadStep } from './steps/publish.js';

export const PIPELINE_STEPS: PipelineStep[] = [
  researchStep,
  scriptStep,
  factCheckStep,
  scenePlanStep,
  visualsStep,
  voiceStep,
  editStep,
  qcStep,
  thumbnailStep,
  seoStep,
  scheduleStep,
  uploadStep,
  analyticsStep,
];

export interface AdvancePayload extends Record<string, unknown> {
  videoId: string;
  /** Only run if the video is still in this status — guards against duplicate jobs. */
  expectStatus?: VideoStatus;
  reason?: string;
}

export interface AdvanceOutcome {
  videoId: string;
  from: VideoStatus;
  to: VideoStatus;
  step: string;
  note?: string;
  waitingForApproval?: boolean;
  enqueuedNext: boolean;
}

/**
 * Drives a video through the pipeline, one step per queue job (spec §7, §69).
 *
 * One job = one step. That is the property that makes failure cheap: a step that fails
 * retries only itself, and never re-pays for the generation the previous steps already did.
 */
export class PipelineRunner {
  private readonly steps = new Map<VideoStatus, PipelineStep>();

  constructor(
    private readonly deps: PipelineDeps,
    steps: PipelineStep[] = PIPELINE_STEPS,
  ) {
    for (const step of steps) this.steps.set(step.from, step);
  }

  stepFor(status: VideoStatus): PipelineStep | undefined {
    return this.steps.get(status);
  }

  /** Queues the next advance for a video. Idempotent per (video, status). */
  async enqueue(videoId: string, opts: { delayMs?: number; reason?: string; expectStatus?: VideoStatus } = {}): Promise<string> {
    const video = await this.deps.repos.videos.findById(videoId);
    if (!video) throw new NotFoundError('Video');

    const job = await this.deps.repos.jobs.create({
      queue: QUEUES.pipeline,
      name: `advance:${video.status}`,
      channelId: video.channelId,
      videoId: video.id,
      state: 'QUEUED',
      payload: { videoId, expectStatus: opts.expectStatus ?? video.status, reason: opts.reason },
      attemptCount: 0,
      maxAttempts: 3,
    });

    await this.deps.queue.enqueue<AdvancePayload>(
      QUEUES.pipeline,
      `advance:${video.status}`,
      { videoId, expectStatus: opts.expectStatus ?? video.status, reason: opts.reason, jobId: job.id },
      { delayMs: opts.delayMs, jobId: job.id, maxAttempts: 3 },
    );
    return job.id;
  }

  /** Queue handler. Registered by the worker for the `pipeline` queue. */
  async handle(job: QueueJob<AdvancePayload>): Promise<void> {
    const jobId = (job.data.jobId as string | undefined) ?? job.id;
    await this.deps.repos.jobs
      .update(jobId, { state: 'RUNNING', attemptCount: job.attempt, startedAt: this.deps.clock.now() })
      .catch(() => undefined);

    try {
      const outcome = await this.advance(job.data.videoId, {
        expectStatus: job.data.expectStatus,
        jobId,
        attempt: job.attempt,
      });
      await this.deps.repos.jobs
        .update(jobId, {
          state: outcome.waitingForApproval ? 'WAITING_APPROVAL' : 'SUCCEEDED',
          finishedAt: this.deps.clock.now(),
        })
        .catch(() => undefined);
    } catch (err) {
      await this.recordFailure(jobId, job, err);
      throw err;
    }
  }

  /**
   * Runs exactly one step. Returns what happened; the caller decides whether that was a
   * queue job or a direct call from the CLI.
   */
  async advance(
    videoId: string,
    opts: {
      expectStatus?: VideoStatus;
      jobId?: string;
      attempt?: number;
      signal?: AbortSignal;
      /**
       * Queue the follow-up step. `runToCompletion` drives the loop itself and passes
       * false, so the CLI does not leave orphaned QUEUED rows behind it.
       */
      enqueueFollowUp?: boolean;
    } = {},
  ): Promise<AdvanceOutcome> {
    const video = await this.deps.repos.videos.findById(videoId);
    if (!video) throw new NotFoundError('Video');

    if (opts.expectStatus && video.status !== opts.expectStatus) {
      this.deps.logger.info('skipping stale pipeline job', {
        videoId,
        expected: opts.expectStatus,
        actual: video.status,
      });
      return {
        videoId,
        from: video.status,
        to: video.status,
        step: 'none',
        note: `Skipped — the video moved to ${video.status} before this job ran.`,
        enqueuedNext: false,
      };
    }

    const step = this.steps.get(video.status);
    if (!step) {
      return {
        videoId,
        from: video.status,
        to: video.status,
        step: 'none',
        note: `No pipeline step handles ${video.status}.`,
        enqueuedNext: false,
      };
    }

    const channel = await this.deps.repos.channels.findById(video.channelId);
    if (!channel) throw new NotFoundError('Channel');
    const settings = await this.deps.repos.channelSettings.findByChannel(channel.id);
    if (!settings) throw new PipelineError(`Channel ${channel.id} has no settings`, undefined, false);

    // Budget gate (spec §42). Essential steps finish work already paid for.
    if (!step.essential) {
      const budget = await this.deps.budget.status(channel.id);
      if (budget.blocked) {
        this.deps.logger.warn('pipeline paused — monthly budget exhausted', {
          videoId,
          channelId: channel.id,
          spentUsd: budget.spentUsd,
          budgetUsd: budget.budgetUsd,
        });
        await this.deps.notifier.notify(channel.userId, {
          event: 'BUDGET_EXCEEDED',
          title: `Budget exhausted for ${channel.name}`,
          body: `$${budget.spentUsd.toFixed(2)} of a $${budget.budgetUsd.toFixed(
            2,
          )} monthly budget has been spent. Production is paused until the budget is raised.`,
          url: `${this.deps.config.http.appUrl}/costs`,
          meta: { channelId: channel.id },
        });
        return {
          videoId,
          from: video.status,
          to: video.status,
          step: step.name,
          note: 'Paused — the channel has reached its monthly AI budget.',
          waitingForApproval: true,
          enqueuedNext: false,
        };
      }
      if (budget.level === 'warning' || budget.level === 'critical') {
        await this.deps.notifier.notify(channel.userId, {
          event: 'BUDGET_WARNING',
          title: `${Math.round(budget.utilisation * 100)}% of the ${channel.name} budget used`,
          body: `$${budget.spentUsd.toFixed(2)} of $${budget.budgetUsd.toFixed(
            2,
          )} spent this month. Projected month end: $${budget.projectedMonthEndUsd.toFixed(2)}.`,
          url: `${this.deps.config.http.appUrl}/costs`,
          meta: { channelId: channel.id, level: budget.level },
        });
      }
    }

    const workDir = await createWorkDir(this.deps.config.media.workDir, `video-${video.id}`);
    const logger = this.deps.logger.child({
      videoId: video.id,
      channelId: channel.id,
      jobId: opts.jobId,
      step: step.name,
    });

    const ctx: StepContext = {
      ...this.deps,
      logger,
      video,
      channel,
      settings,
      jobId: opts.jobId,
      workDir,
      signal: opts.signal,
      reportProgress: async (percent) => {
        const progress = { ...(video.progress ?? {}), [step.running]: Math.max(0, Math.min(100, percent)) };
        await this.deps.repos.videos.update(video.id, { progress });
      },
    };

    // Mark the in-progress status so the UI shows the live stage.
    if (video.status !== step.running) {
      VideoStateMachine.assert(video.status, step.running);
      await this.deps.repos.videos.update(video.id, {
        status: step.running,
        previousStatus: video.status,
      });
    }

    const started = Date.now();
    try {
      logger.info('pipeline step starting');
      const result = await step.execute(ctx);

      VideoStateMachine.assert(step.running, result.status);
      const progress = { ...(video.progress ?? {}), [step.running]: 100 };
      const actualCost = await this.deps.repos.usage.sumForVideo(video.id);

      await this.deps.repos.videos.update(video.id, {
        ...result.patch,
        status: result.status,
        previousStatus: step.running,
        progress,
        actualCostUsd: actualCost,
      });

      logger.info('pipeline step finished', {
        to: result.status,
        note: result.note,
        durationMs: Date.now() - started,
        costUsd: actualCost,
      });

      const hasNextStep =
        result.enqueueNext !== false && result.status !== 'FAILED' && this.steps.has(result.status);
      if (hasNextStep && opts.enqueueFollowUp !== false) {
        await this.enqueue(video.id, {
          delayMs: result.delayMs,
          reason: `after ${step.name}`,
          expectStatus: result.status,
        });
      }

      return {
        videoId: video.id,
        from: video.status,
        to: result.status,
        step: step.name,
        note: result.note,
        waitingForApproval: result.waitingForApproval,
        enqueuedNext: hasNextStep,
      };
    } catch (err) {
      const attempt = opts.attempt ?? 1;
      const retryable = isRetryable(err) && attempt < 3;
      logger.error('pipeline step failed', {
        error: errorMessage(err),
        attempt,
        willRetry: retryable,
      });

      if (retryable) {
        // Put the video back where the step started so the retry re-enters cleanly.
        await this.deps.repos.videos.update(video.id, { status: step.from });
        throw err;
      }

      await this.deps.repos.videos.update(video.id, {
        status: 'FAILED',
        previousStatus: step.running,
        failureReason: `${step.name}: ${errorMessage(err)}`.slice(0, 900),
      });
      await this.deps.scheduler.release(video.id).catch(() => undefined);
      await this.deps.notifier.notify(channel.userId, {
        event: 'PIPELINE_FAILED',
        title: `Production failed for "${video.title}"`,
        body: `Step "${step.name}" failed: ${errorMessage(err)}`,
        url: `${this.deps.config.http.appUrl}/videos/${video.id}`,
        meta: { step: step.name, videoId: video.id },
      });
      throw err;
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** Runs steps back to back until the pipeline stops. Used by the CLI and by tests. */
  async runToCompletion(
    videoId: string,
    opts: { maxSteps?: number; stopAt?: VideoStatus } = {},
  ): Promise<AdvanceOutcome[]> {
    const outcomes: AdvanceOutcome[] = [];
    const maxSteps = opts.maxSteps ?? 40;

    for (let i = 0; i < maxSteps; i += 1) {
      const video = await this.deps.repos.videos.findById(videoId);
      if (!video) throw new NotFoundError('Video');
      if (video.status === 'FAILED') break;
      if (opts.stopAt && video.status === opts.stopAt) break;
      if (!this.steps.has(video.status)) break;

      // The loop is the driver here, so no follow-up job is queued for someone else to run.
      const outcome = await this.advance(videoId, { jobId: newId('cli'), enqueueFollowUp: false });
      outcomes.push(outcome);
      if (outcome.waitingForApproval || outcome.step === 'none') break;
      if (!outcome.enqueuedNext && outcome.to === video.status) break;
      if (!outcome.enqueuedNext) break;
    }
    return outcomes;
  }

  /**
   * Restarts a failed video from the stage that broke, or from an explicit stage.
   * Used by the Videos screen's Retry action and by the maintenance sweeper.
   */
  async retry(videoId: string, from?: VideoStatus): Promise<AdvanceOutcome> {
    const video = await this.deps.repos.videos.findById(videoId);
    if (!video) throw new NotFoundError('Video');

    const target = from ?? resumePoint(video.previousStatus ?? 'IDEA');
    VideoStateMachine.assert(video.status, target);
    await this.deps.repos.videos.update(videoId, { status: target, failureReason: null });
    return this.advance(videoId, { expectStatus: target });
  }

  private async recordFailure(jobId: string, job: QueueJob<AdvancePayload>, err: unknown): Promise<void> {
    const retryable = isRetryable(err) && job.attempt < job.maxAttempts;
    await this.deps.repos.jobs
      .update(jobId, {
        state: retryable ? 'QUEUED' : 'FAILED',
        attemptCount: job.attempt,
        lastError: errorMessage(err).slice(0, 500),
        retryAt: retryable ? new Date(this.deps.clock.now().getTime() + backoffDelay(job.attempt)) : null,
        finishedAt: retryable ? null : this.deps.clock.now(),
      })
      .catch(() => undefined);
    await this.deps.repos.jobs
      .recordError({
        jobId,
        attempt: job.attempt,
        message: errorMessage(err).slice(0, 1000),
        stack: err instanceof Error ? err.stack?.slice(0, 4000) ?? null : null,
        provider: null,
      })
      .catch(() => undefined);
  }
}

/** Where a retry should re-enter after a failure in `status`. */
export function resumePoint(status: VideoStatus): VideoStatus {
  const map: Partial<Record<VideoStatus, VideoStatus>> = {
    RESEARCHING: 'IDEA',
    SCRIPTING: 'RESEARCH_COMPLETE',
    FACT_CHECK: 'SCRIPT_READY',
    SCENE_PLANNING: 'SCENE_PLANNING',
    GENERATING_VISUALS: 'GENERATING_VISUALS',
    GENERATING_VOICE: 'GENERATING_VOICE',
    EDITING: 'EDITING',
    QC: 'QC',
    THUMBNAIL: 'THUMBNAIL',
    SEO: 'SEO',
    READY: 'READY',
    SCHEDULED: 'SCHEDULED',
  };
  return map[status] ?? 'IDEA';
}
