import { z } from 'zod';
import { repos } from '@/lib/db/repos';
import { mailboxFor } from '@/lib/email/sync';
import { sendDigest } from '@/lib/email/digest';
import { ApiError, json, parseBody, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  /** 0–23, or null to switch the brief off. */
  hour: z.coerce.number().int().min(0).max(23).nullable(),
});

/** Sets the hour the brief goes out, or turns it off. */
export const PATCH = withAuth(async (request, { auth }) => {
  const { hour } = await parseBody(request, schema);
  const account = mailboxFor(auth.org.id);
  if (!account) throw new ApiError(400, 'צריך לחבר תיבת מייל קודם');

  repos.emailAccounts.update(auth.org.id, account.id, { digest_hour: hour });
  return json({ hour });
});

/** Sends it now, whatever the schedule says — the only way to know it actually arrives. */
export const POST = withAuth(async (_request, { auth }) => {
  const account = mailboxFor(auth.org.id);
  if (!account) throw new ApiError(400, 'צריך לחבר תיבת מייל קודם');

  const result = await sendDigest(account, { force: true });
  if (!result.sent) throw new ApiError(400, result.reason ?? 'השליחה נכשלה');
  return json({ sent: true, to: account.email });
}, { limit: 5, windowMs: 60_000 });
