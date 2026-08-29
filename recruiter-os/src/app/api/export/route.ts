import { getDb } from '@/lib/db/index';
import { withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Tables excluded from a backup: credentials, live sessions, and bookkeeping that means
 * nothing outside the machine that wrote it.
 */
const EXCLUDED = new Set(['sessions', 'memberships', 'rate_limits', 'schema_migrations']);

/**
 * Every org-scoped table currently in the schema.
 *
 * Read from the database rather than listed by hand: a table added by a later migration
 * joins the backup automatically, instead of being quietly missing from it for months
 * until someone needs to restore.
 */
function exportableTables(): string[] {
  const db = getDb();
  const tables = db.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  return tables
    .filter((table) => !EXCLUDED.has(table.name))
    .filter((table) =>
      db.all<{ name: string }>(`PRAGMA table_info(${table.name})`).some((c) => c.name === 'org_id'),
    )
    .map((table) => table.name);
}

/** Columns that must never leave the server, whatever the table they sit in. */
const SECRETS = new Set(['password_hash', 'password_salt', 'token_hash', 'api_token']);

function scrub(row: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!SECRETS.has(key)) clean[key] = value;
  }
  return clean;
}

/**
 * Downloads everything this organisation owns as one JSON file.
 *
 * The point is that the recruiter's data is never trapped in one container: a
 * misconfigured volume, a closed account or a decision to move elsewhere should all be
 * survivable by someone who took a backup. Scoped to the caller's organisation like every
 * other query here, and credential columns are stripped on the way out.
 */
export const GET = withAuth(async (_request, { auth }) => {
  const db = getDb();
  const data: Record<string, unknown[]> = {};

  for (const table of exportableTables()) {
    const rows = db.all<Record<string, unknown>>(`SELECT * FROM ${table} WHERE org_id = ?`, auth.org.id);
    data[table] = rows.map(scrub);
  }

  const body = JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      organization: auth.org.name,
      note: 'גיבוי מלא של הנתונים. קבצי קורות החיים עצמם אינם כלולים — רק הטקסט שחולץ מהם.',
      data,
    },
    null,
    2,
  );

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="recruiter-os-backup-${stamp}.json"`,
      'cache-control': 'no-store',
    },
  });
}, { limit: 5, windowMs: 60_000 });
