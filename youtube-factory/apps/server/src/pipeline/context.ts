import type { Agents } from '../agents/index.js';
import type { AppConfig } from '../config/index.js';
import type { Repositories } from '../db/ports.js';
import type { ChannelRecord, ChannelSettingsRecord, VideoRecord } from '../db/types.js';
import type { FfmpegRenderer } from '../media/renderer.js';
import type { ProviderRegistry } from '../providers/registry.js';
import type { JobQueue } from '../queue/index.js';
import type { Clock } from '../shared/clock.js';
import type { Logger } from '../shared/logger.js';
import type { VideoStatus } from '../shared/types.js';
import type { Storage } from '../storage/index.js';
import type { BudgetGuard } from '../services/budget.js';
import type { CostOptimizer } from '../services/cost.js';
import type { Notifier } from '../services/notifications.js';
import type { RulesEngine } from '../services/rules.js';
import type { SchedulingEngine } from '../services/scheduler.js';

export interface PipelineDeps {
  config: AppConfig;
  repos: Repositories;
  registry: ProviderRegistry;
  agents: Agents;
  storage: Storage;
  renderer: FfmpegRenderer;
  budget: BudgetGuard;
  costs: CostOptimizer;
  scheduler: SchedulingEngine;
  rules: RulesEngine;
  notifier: Notifier;
  queue: JobQueue;
  clock: Clock;
  logger: Logger;
}

export interface StepContext extends PipelineDeps {
  video: VideoRecord;
  channel: ChannelRecord;
  settings: ChannelSettingsRecord;
  jobId?: string;
  /** Scratch directory for this step; cleaned up by the runner. */
  workDir: string;
  /** Publishes progress for the current stage (0-100). */
  reportProgress(percent: number): Promise<void>;
  signal?: AbortSignal;
}

export interface StepResult {
  status: VideoStatus;
  /** Set false to stop the chain here — used by approval gates and terminal states. */
  enqueueNext?: boolean;
  delayMs?: number;
  waitingForApproval?: boolean;
  note?: string;
  patch?: Partial<VideoRecord>;
}

export interface PipelineStep {
  readonly name: string;
  /** Only runs when the video is in this status. */
  readonly from: VideoStatus;
  /** Status held while the step is executing. */
  readonly running: VideoStatus;
  /** Whether this step must run even when the budget is exhausted (spec §42). */
  readonly essential?: boolean;
  execute(ctx: StepContext): Promise<StepResult>;
}
