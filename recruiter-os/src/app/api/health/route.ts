import fs from 'node:fs';
import { getDb } from '@/lib/db/index';
import { hashPassword } from '@/lib/auth/password';

/**
 * How much memory this container is allowed, and how much it is using.
 *
 * A container close to its ceiling behaves exactly like the symptom that is hardest to
 * diagnose from outside: trivial endpoints stay instant while anything that allocates —
 * rendering a page, reading a list — crawls, because the collector is running constantly
 * to stay under the limit. The limit is not visible to Node, so it is read from the
 * kernel's cgroup, where the platform actually sets it.
 */
function memory(): Record<string, number | string> {
  const usage = process.memoryUsage();
  const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);

  let limitMb: number | null = null;
  for (const path of ['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes']) {
    try {
      const raw = fs.readFileSync(path, 'utf8').trim();
      if (raw && raw !== 'max') {
        const bytes = Number(raw);
        // An unset limit is reported as an absurdly large number rather than absent.
        if (Number.isFinite(bytes) && bytes < 1024 ** 4) limitMb = mb(bytes);
      }
      break;
    } catch {
      /* not this layout */
    }
  }

  const used = mb(usage.rss);
  return {
    rss_mb: used,
    heap_mb: mb(usage.heapUsed),
    limit_mb: limitMb ?? 'לא ידוע',
    percent_used: limitMb ? Math.round((used / limitMb) * 100) : 'לא ידוע',
  };
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Liveness check, and — with `?deep=1` — a timing breakdown.
 *
 * The plain check deliberately touches nothing: no database, no session, no disk, so it
 * stays truthful when exactly those are the things under strain. That is what makes the
 * deep variant meaningful. When the bare check answers instantly and every real page
 * crawls, the difference between them is the whole diagnosis, and these are the four
 * costs that separate them on a managed host: opening the database, reading it, writing
 * to it — the one that pays for network-backed storage on every commit — and hashing a
 * password, which is CPU-bound by design and therefore the first casualty of a throttled
 * container.
 *
 * Open to anyone on purpose: it reports durations, never data, and needing a session to
 * run it would make it useless precisely when signing in is what has broken.
 */
export async function GET(request: Request) {
  const base = { ok: true, at: new Date().toISOString(), port: process.env.PORT ?? null };
  if (new URL(request.url).searchParams.get('deep') !== '1') {
    return Response.json(base, { headers: { 'cache-control': 'no-store' } });
  }

  const timings: Record<string, number> = {};
  const time = async (label: string, fn: () => unknown | Promise<unknown>) => {
    const started = performance.now();
    try {
      await fn();
    } catch (caught) {
      timings[`${label}_failed`] = 1;
      timings[label] = Math.round(performance.now() - started);
      throw caught;
    }
    timings[label] = Math.round(performance.now() - started);
  };

  try {
    let db!: ReturnType<typeof getDb>;
    await time('db_open_ms', () => { db = getDb(); });
    await time('db_read_ms', () => db.get('SELECT COUNT(*) AS n FROM users'));
    await time('db_write_ms', () => {
      // A real commit, so the cost of a network-backed volume shows up rather than hiding
      // behind a cached read. Removed immediately; the row never outlives the check.
      db.run(
        "INSERT INTO rate_limits (bucket, window_start, count) VALUES ('__healthcheck', ?, 1) " +
          'ON CONFLICT(bucket) DO UPDATE SET count = count + 1',
        Date.now(),
      );
      db.run("DELETE FROM rate_limits WHERE bucket = '__healthcheck'");
    });
    await time('password_hash_ms', () => hashPassword('benchmark-only-never-stored'));

    const slowest = Object.entries(timings).sort((a, b) => b[1] - a[1])[0];
    const mem = memory();
    const tight = typeof mem.percent_used === 'number' && mem.percent_used > 80;
    return Response.json(
      {
        ...base,
        timings,
        memory: mem,
        slowest: slowest ? slowest[0] : null,
        verdict:
          tight ? `הזיכרון כמעט מלא (${mem.percent_used}%) — זה מאט כל דף שמרנדר`
          : (timings.db_write_ms ?? 0) > 500 ? 'האחסון איטי — כתיבה למסד לוקחת יותר מחצי שנייה'
          : (timings.password_hash_ms ?? 0) > 1500 ? 'המעבר חנוק — גיבוב סיסמה לוקח יותר משנייה וחצי'
          : (timings.db_open_ms ?? 0) > 1000 ? 'פתיחת המסד איטית — כנראה מיגרציה או נעילה'
          : 'הכול בטווח תקין',
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (caught) {
    return Response.json(
      { ...base, ok: false, timings, error: caught instanceof Error ? caught.message : String(caught) },
      { status: 500, headers: { 'cache-control': 'no-store' } },
    );
  }
}
