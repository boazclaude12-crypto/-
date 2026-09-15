import { z } from 'zod';
import { getDb } from '@/lib/db/index';
import { bootstrapOrganization } from '@/lib/domain/bootstrap';
import { ApiError, json, parseBody, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Typed by the user to confirm. Deliberately a word they must read to reproduce. */
const CONFIRMATION = 'מחק';

const schema = z.object({ confirm: z.string() });

/**
 * Everything that is business data, in an order that respects the foreign keys.
 *
 * `email_accounts` is deliberately absent: clearing a demo account is how a recruiter
 * starts working for real, and making them reconnect their mailbox at that exact moment
 * is a step nobody would thank us for. `email_messages` does go, so the applications
 * already in the mailbox are re-imported into the fresh account on the next sync.
 */
const TABLES = [
  'automation_runs', 'activity_events', 'messages', 'notes', 'tasks',
  'payments', 'placements', 'interviews', 'applications',
  'candidate_tags', 'job_tags', 'candidate_documents', 'candidate_attributes',
  'candidate_experiences', 'job_requirements',
  'email_messages',
  'candidates', 'jobs', 'client_contacts', 'clients',
  'automations', 'tags', 'stages',
] as const;

/**
 * Empties the account and restores it to the state a new one starts in.
 *
 * Scoped to the caller's organisation like every other query, and irreversible — which is
 * why it asks for a typed word rather than a button press, and why the response says
 * exactly how much was removed.
 */
export const POST = withAuth(async (request, { auth }) => {
  const { confirm } = await parseBody(request, schema);
  if (confirm.trim() !== CONFIRMATION) {
    throw new ApiError(400, `כדי לאשר, הקלד: ${CONFIRMATION}`);
  }

  const db = getDb();
  const removed = db.transaction(() => {
    let total = 0;
    for (const table of TABLES) {
      total += db.run(`DELETE FROM ${table} WHERE org_id = ?`, auth.org.id).changes;
    }
    // Stages, starter automations and tags go with everything else, then come back —
    // an account without a pipeline is not a clean account, it is a broken one.
    bootstrapOrganization(auth.org.id);
    return total;
  });

  return json({ removed });
}, { limit: 3, windowMs: 60 * 60_000 });
