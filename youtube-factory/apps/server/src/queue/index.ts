import type { AppConfig } from '../config/index.js';
import type { Clock } from '../shared/clock.js';
import { systemClock } from '../shared/clock.js';
import { newId } from '../shared/ids.js';
import { backoffDelay } from '../shared/retry.js';
import { errorMessage } from '../shared/errors.js';
import type { Logger } from '../shared/logger.js';
import { nullLogger } from '../shared/logger.js';

/** Named queues (spec §6 of the architecture doc). */
export const QUEUES = {
  pipeline: 'pipeline',
  discovery: 'discovery',
  analytics: 'analytics',
  maintenance: 'maintenance',
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface QueueJob<T = Record<string, unknown>> {
  id: string;
  queue: string;
  name: string;
  data: T;
  attempt: number;
  maxAttempts: number;
}

export interface EnqueueOptions {
  delayMs?: number;
  /** Idempotency key — enqueueing the same id twice is a no-op while it is pending. */
  jobId?: string;
  maxAttempts?: number;
  priority?: number;
}

export type JobHandler<T = Record<string, unknown>> = (job: QueueJob<T>) => Promise<void>;

export interface QueueCounts {
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
}

export interface JobQueue {
  readonly driver: 'bullmq' | 'memory';
  enqueue<T extends object>(queue: string, name: string, data: T, opts?: EnqueueOptions): Promise<string>;
  register<T extends object>(queue: string, handler: JobHandler<T>, concurrency?: number): void;
  /** Begin consuming registered queues. */
  start(): Promise<void>;
  counts(queue: string): Promise<QueueCounts>;
  close(): Promise<void>;
}

interface PendingJob extends QueueJob {
  runAt: number;
  priority: number;
}

/**
 * Full in-process queue: delays, priorities, bounded concurrency, exponential-backoff
 * retries and dead-lettering. Used by tests, by the `factory` CLI and by any deployment
 * that has not been given a Redis (spec §73).
 */
export class InMemoryQueue implements JobQueue {
  readonly driver = 'memory' as const;
  private readonly pending: PendingJob[] = [];
  private readonly handlers = new Map<string, { handler: JobHandler; concurrency: number }>();
  private readonly active = new Map<string, number>();
  private readonly stats = new Map<string, { completed: number; failed: number }>();
  private readonly seen = new Set<string>();
  private running = false;
  private timer: NodeJS.Timeout | undefined;
  private idleWaiters: Array<() => void> = [];

  constructor(
    private readonly clock: Clock = systemClock,
    private readonly logger: Logger = nullLogger,
  ) {}

  async enqueue<T extends object>(
    queue: string,
    name: string,
    data: T,
    opts: EnqueueOptions = {},
  ): Promise<string> {
    const id = opts.jobId ?? newId('job');
    if (opts.jobId && this.seen.has(opts.jobId)) return opts.jobId;
    if (opts.jobId) this.seen.add(opts.jobId);
    this.pending.push({
      id,
      queue,
      name,
      data: data as Record<string, unknown>,
      attempt: 0,
      maxAttempts: opts.maxAttempts ?? 3,
      runAt: this.clock.now().getTime() + (opts.delayMs ?? 0),
      priority: opts.priority ?? 100,
    });
    this.pending.sort((a, b) => a.runAt - b.runAt || a.priority - b.priority);
    if (this.running) this.pump();
    return id;
  }

  register<T extends object>(queue: string, handler: JobHandler<T>, concurrency = 1): void {
    this.handlers.set(queue, { handler: handler as unknown as JobHandler, concurrency });
  }

  async start(): Promise<void> {
    this.running = true;
    this.pump();
    this.timer = setInterval(() => this.pump(), 50);
    this.timer.unref?.();
  }

  /** Runs every ready job (and everything they enqueue) until nothing is left. */
  async runUntilIdle(maxIterations = 10_000): Promise<void> {
    this.running = true;
    for (let i = 0; i < maxIterations; i += 1) {
      const now = this.clock.now().getTime();
      const ready = this.pending.filter((j) => j.runAt <= now && this.handlers.has(j.queue));
      if (ready.length === 0) {
        if (this.busy === 0) {
          const nextDelayed = this.pending
            .filter((j) => this.handlers.has(j.queue))
            .sort((a, b) => a.runAt - b.runAt)[0];
          if (!nextDelayed) return;
          // Jump the clock forward to the next scheduled job rather than waiting for it.
          await this.clock.sleep(Math.max(1, nextDelayed.runAt - now));
          continue;
        }
        await this.clock.sleep(5);
        continue;
      }
      await this.runOne(ready[0]!);
    }
    throw new Error('InMemoryQueue.runUntilIdle exceeded its iteration budget');
  }

  private get busy(): number {
    let n = 0;
    for (const count of this.active.values()) n += count;
    return n;
  }

  private pump(): void {
    if (!this.running) return;
    const now = this.clock.now().getTime();
    for (const job of [...this.pending]) {
      const registration = this.handlers.get(job.queue);
      if (!registration || job.runAt > now) continue;
      if ((this.active.get(job.queue) ?? 0) >= registration.concurrency) continue;
      void this.runOne(job);
    }
  }

  private async runOne(job: PendingJob): Promise<void> {
    const index = this.pending.indexOf(job);
    if (index === -1) return;
    this.pending.splice(index, 1);
    const registration = this.handlers.get(job.queue);
    if (!registration) return;

    this.active.set(job.queue, (this.active.get(job.queue) ?? 0) + 1);
    const attempt = job.attempt + 1;
    try {
      await registration.handler({ ...job, attempt });
      this.bump(job.queue, 'completed');
    } catch (err) {
      this.logger.warn('queue job failed', { jobId: job.id, queue: job.queue, error: errorMessage(err) });
      if (attempt < job.maxAttempts) {
        this.pending.push({
          ...job,
          attempt,
          runAt: this.clock.now().getTime() + backoffDelay(attempt, 200, 5_000),
        });
        this.pending.sort((a, b) => a.runAt - b.runAt || a.priority - b.priority);
      } else {
        this.bump(job.queue, 'failed');
      }
    } finally {
      this.active.set(job.queue, Math.max(0, (this.active.get(job.queue) ?? 1) - 1));
      if (this.busy === 0) {
        const waiters = this.idleWaiters;
        this.idleWaiters = [];
        for (const w of waiters) w();
      }
    }
  }

  private bump(queue: string, key: 'completed' | 'failed'): void {
    const entry = this.stats.get(queue) ?? { completed: 0, failed: 0 };
    entry[key] += 1;
    this.stats.set(queue, entry);
  }

  async counts(queue: string): Promise<QueueCounts> {
    const now = this.clock.now().getTime();
    const mine = this.pending.filter((j) => j.queue === queue);
    const entry = this.stats.get(queue) ?? { completed: 0, failed: 0 };
    return {
      waiting: mine.filter((j) => j.runAt <= now).length,
      delayed: mine.filter((j) => j.runAt > now).length,
      active: this.active.get(queue) ?? 0,
      completed: entry.completed,
      failed: entry.failed,
    };
  }

  async close(): Promise<void> {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}

/** Redis-backed production queue. */
export class BullMqQueue implements JobQueue {
  readonly driver = 'bullmq' as const;
  private readonly queues = new Map<string, import('bullmq').Queue>();
  private readonly workers: Array<import('bullmq').Worker> = [];
  private readonly registrations = new Map<string, { handler: JobHandler; concurrency: number }>();
  private connection: import('ioredis').Redis | undefined;

  constructor(
    private readonly redisUrl: string,
    private readonly defaultConcurrency = 4,
    private readonly logger: Logger = nullLogger,
  ) {}

  private async conn() {
    if (!this.connection) {
      const { Redis } = await import('ioredis');
      this.connection = new Redis(this.redisUrl, { maxRetriesPerRequest: null });
    }
    return this.connection;
  }

  private async queueFor(name: string) {
    let queue = this.queues.get(name);
    if (!queue) {
      const { Queue } = await import('bullmq');
      queue = new Queue(name, { connection: await this.conn() });
      this.queues.set(name, queue);
    }
    return queue;
  }

  async enqueue<T extends object>(
    queue: string,
    name: string,
    data: T,
    opts: EnqueueOptions = {},
  ): Promise<string> {
    const q = await this.queueFor(queue);
    const job = await q.add(name, data, {
      delay: opts.delayMs,
      jobId: opts.jobId,
      priority: opts.priority,
      attempts: opts.maxAttempts ?? 3,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: { age: 86_400, count: 1_000 },
      removeOnFail: { age: 604_800 },
    });
    return job.id ?? newId('job');
  }

  register<T extends object>(queue: string, handler: JobHandler<T>, concurrency?: number): void {
    this.registrations.set(queue, {
      handler: handler as unknown as JobHandler,
      concurrency: concurrency ?? this.defaultConcurrency,
    });
  }

  async start(): Promise<void> {
    const { Worker } = await import('bullmq');
    for (const [queue, registration] of this.registrations) {
      const worker = new Worker(
        queue,
        async (job) => {
          await registration.handler({
            id: String(job.id),
            queue,
            name: job.name,
            data: job.data as Record<string, unknown>,
            attempt: job.attemptsMade + 1,
            maxAttempts: job.opts.attempts ?? 3,
          });
        },
        { connection: await this.conn(), concurrency: registration.concurrency },
      );
      worker.on('failed', (job, err) => {
        this.logger.warn('queue job failed', {
          jobId: String(job?.id),
          queue,
          error: errorMessage(err),
        });
      });
      this.workers.push(worker);
    }
  }

  async counts(queue: string): Promise<QueueCounts> {
    const q = await this.queueFor(queue);
    const counts = await q.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed');
    return {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
    };
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    await this.connection?.quit();
    this.connection = undefined;
  }
}

export function createQueue(config: AppConfig, clock: Clock = systemClock, logger: Logger = nullLogger): JobQueue {
  if (config.queue.driver === 'bullmq' && config.queue.redisUrl) {
    return new BullMqQueue(config.queue.redisUrl, config.queue.concurrency, logger);
  }
  return new InMemoryQueue(clock, logger);
}
