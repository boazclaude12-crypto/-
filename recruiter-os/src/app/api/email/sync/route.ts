import { syncMailbox } from '@/lib/email/sync';
import { json, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Reading a mailbox and parsing CVs is slow; give it room beyond the default. */
export const maxDuration = 300;

/** Pulls new applications now, rather than waiting for the scheduled run. */
export const POST = withAuth(async (_request, { auth }) => {
  const result = await syncMailbox(auth.org.id, auth.user.id, { limit: 40 });
  return json(result);
}, { limit: 6, windowMs: 60_000 });
