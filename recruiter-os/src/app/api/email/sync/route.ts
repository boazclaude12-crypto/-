import { syncMailbox } from '@/lib/email/sync';
import { json, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Reading a mailbox and parsing CVs is slow; give it room beyond the default. */
export const maxDuration = 300;

/**
 * Pulls new applications now, rather than waiting for the scheduled run.
 *
 * A deliberately small batch. A mailbox with two hundred applications in it would
 * otherwise make the first pull a single request several minutes long, with nothing on
 * screen until it finished — and any interruption would waste all of it. Fifteen comes
 * back quickly with a real count, and the response says how many are still waiting so
 * the recruiter can simply press again.
 */
export const POST = withAuth(async (_request, { auth }) => {
  const result = await syncMailbox(auth.org.id, auth.user.id, { limit: 15 });
  return json(result);
}, { limit: 20, windowMs: 60_000 });
