import { getDb } from './db/index';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window limiter backed by the database, so it survives restarts and works
 * across serverless instances that share the same database file.
 */
export function checkRateLimit(bucket: string, limit: number, windowMs: number): RateLimitResult {
  const db = getDb();
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;

  return db.transaction(() => {
    const row = db.get<{ window_start: number; count: number }>(
      'SELECT window_start, count FROM rate_limits WHERE bucket = ?',
      bucket,
    );

    if (!row || row.window_start !== windowStart) {
      db.run(
        `INSERT INTO rate_limits (bucket, window_start, count) VALUES (?, ?, 1)
         ON CONFLICT(bucket) DO UPDATE SET window_start = excluded.window_start, count = 1`,
        bucket,
        windowStart,
      );
      return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
    }

    if (row.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.ceil((windowStart + windowMs - now) / 1000),
      };
    }

    db.run('UPDATE rate_limits SET count = count + 1 WHERE bucket = ?', bucket);
    return { allowed: true, remaining: limit - row.count - 1, retryAfterSeconds: 0 };
  });
}

/** Called after a successful login so a user is not punished for earlier typos. */
export function clearRateLimit(bucket: string): void {
  getDb().run('DELETE FROM rate_limits WHERE bucket = ?', bucket);
}
