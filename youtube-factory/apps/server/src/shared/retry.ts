import type { Clock } from './clock.js';
import { isRetryable } from './errors.js';

export interface RetryOptions {
  attempts: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Deterministic in tests: pass () => 0. */
  jitter?: () => number;
  onAttemptFailed?: (err: unknown, attempt: number, delayMs: number) => void | Promise<void>;
  shouldRetry?: (err: unknown) => boolean;
}

/** Exponential backoff with full jitter (spec §43). */
export function backoffDelay(attempt: number, base = 1000, max = 60_000, jitter = Math.random): number {
  const exp = Math.min(max, base * 2 ** Math.max(0, attempt - 1));
  return Math.round(exp * (0.5 + 0.5 * jitter()));
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions,
  clock: Clock,
): Promise<T> {
  const attempts = Math.max(1, opts.attempts);
  const shouldRetry = opts.shouldRetry ?? isRetryable;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      const isLast = attempt === attempts;
      if (isLast || !shouldRetry(err)) {
        await opts.onAttemptFailed?.(err, attempt, 0);
        throw err;
      }
      const delay = backoffDelay(attempt, opts.baseDelayMs ?? 1000, opts.maxDelayMs ?? 60_000, opts.jitter);
      await opts.onAttemptFailed?.(err, attempt, delay);
      await clock.sleep(delay);
    }
  }
  throw lastError;
}

/**
 * Circuit breaker used by the provider router — a provider that keeps failing is skipped
 * instead of being retried into the ground (spec §64).
 */
export class CircuitBreaker {
  private failures: number[] = [];
  private openedAt: number | null = null;

  constructor(
    private readonly threshold = 5,
    private readonly windowMs = 60_000,
    private readonly cooldownMs = 120_000,
  ) {}

  isOpen(now = Date.now()): boolean {
    if (this.openedAt === null) return false;
    if (now - this.openedAt >= this.cooldownMs) {
      this.openedAt = null;
      this.failures = [];
      return false;
    }
    return true;
  }

  recordSuccess(): void {
    this.failures = [];
    this.openedAt = null;
  }

  recordFailure(now = Date.now()): void {
    this.failures = this.failures.filter((t) => now - t < this.windowMs);
    this.failures.push(now);
    if (this.failures.length >= this.threshold) this.openedAt = now;
  }
}
