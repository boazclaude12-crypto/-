export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Liveness check.
 *
 * Deliberately touches nothing — no database, no session, no disk. Its only job is to
 * answer the question "did the request reach the application at all", which is the one
 * thing that cannot be told apart from the outside when a host's gateway returns an
 * error of its own. It is also what a platform healthcheck should point at: a check that
 * queried the database would report the app as dead whenever the database was merely
 * busy.
 */
export function GET() {
  return Response.json(
    { ok: true, at: new Date().toISOString(), port: process.env.PORT ?? null },
    { headers: { 'cache-control': 'no-store' } },
  );
}
