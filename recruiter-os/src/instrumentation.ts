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
}
