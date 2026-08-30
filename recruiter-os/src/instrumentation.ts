import { env } from '@/lib/env';

/**
 * Next.js runs this once when the server boots.
 *
 * Configuration is otherwise read lazily, which means a missing AUTH_SECRET or an
 * unwritable data directory surfaces only when the first person tries to register —
 * as an opaque 500, while the host still reports the service as healthy. Checking
 * here turns both into a named error in the deploy log at start-up instead.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (!env.isProduction) return;

  const fail = (message: string) => {
    console.error(`\n[recruiter-os] הפעלה נעצרה: ${message}\n`);
    process.exit(1);
  };

  try {
    env.authSecret;
  } catch {
    fail(
      'AUTH_SECRET חסר או קצר מ-32 תווים. הגדר אותו במשתני הסביבה של השירות ' +
        '(openssl rand -hex 32) והפעל מחדש.',
    );
  }

  const { mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { dirname, join } = await import('node:path');
  const dataDir = dirname(env.databaseFile);
  try {
    mkdirSync(dataDir, { recursive: true });
    const probe = join(dataDir, '.write-probe');
    writeFileSync(probe, '');
    rmSync(probe);
  } catch (caught) {
    fail(
      `אין הרשאת כתיבה ל-${dataDir} (${(caught as Error).message}). ` +
        'זה בדרך כלל Volume שחובר בבעלות root — ודא שהמכולה רצה דרך docker-entrypoint.sh.',
    );
  }

  startMailboxSync();
}

/**
 * Polls connected mailboxes in the background.
 *
 * This is one long-running process, so an interval is the whole scheduler — no cron, no
 * worker, nothing else to deploy or keep alive. The first run is delayed so a restart
 * does not spend its first second on network I/O while the first page is being served,
 * and `unref` keeps the timer from holding the process open during a shutdown.
 */
function startMailboxSync() {
  const run = async () => {
    try {
      const { syncAllMailboxes } = await import('@/lib/email/sync');
      const results = await syncAllMailboxes();
      for (const result of results) {
        if (result.error) console.error(`[recruiter-os] סנכרון מייל נכשל (${result.orgId}): ${result.error}`);
        else if (result.summary.imported > 0) {
          console.log(`[recruiter-os] נקלטו ${result.summary.imported} מועמדים מהמייל (${result.orgId})`);
        }
      }
    } catch (caught) {
      // A failed sync must never take the web server down with it.
      console.error('[recruiter-os] סנכרון מייל נכשל:', caught);
    }
  };

  void import('@/lib/email/sync').then(({ SYNC_INTERVAL_MS }) => {
    setTimeout(run, 60_000).unref();
    setInterval(run, SYNC_INTERVAL_MS).unref();
  });
}
