import { z } from 'zod';
import { repos } from '@/lib/db/repos';
import { encryptSecret } from '@/lib/crypto';
import { testConnection } from '@/lib/email/imap';
import { mailboxFor } from '@/lib/email/sync';
import { ApiError, json, parseBody, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const accountSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
  host: z.string().trim().min(3).max(200).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  secure: z.coerce.boolean().optional(),
  folder: z.string().trim().max(120).optional(),
  /** Nothing older than this is fetched. */
  since_date: z.string().trim().max(30).optional(),
});

/**
 * IMAP hosts for the providers a recruiter is likely to use, so the common case is an
 * address and a password rather than a form asking for server settings.
 */
const KNOWN_HOSTS: Record<string, string> = {
  'gmail.com': 'imap.gmail.com',
  'googlemail.com': 'imap.gmail.com',
  'outlook.com': 'outlook.office365.com',
  'hotmail.com': 'outlook.office365.com',
  'live.com': 'outlook.office365.com',
  'office365.com': 'outlook.office365.com',
  'yahoo.com': 'imap.mail.yahoo.com',
  'walla.co.il': 'imap.walla.co.il',
};

function hostFor(email: string): string | null {
  return KNOWN_HOSTS[email.split('@')[1]?.toLowerCase() ?? ''] ?? null;
}

/** The stored settings, without the credential. */
export const GET = withAuth(async (_request, { auth }) => {
  const account = mailboxFor(auth.org.id);
  if (!account) return json({ account: null });
  return json({
    account: {
      email: account.email,
      host: account.host,
      port: account.port,
      folder: account.folder,
      since_date: account.since_date,
      last_sync_at: account.last_sync_at,
      last_status: account.last_status,
      last_error: account.last_error,
      digest_hour: account.digest_hour,
      enabled: account.enabled === 1,
    },
  });
});

/**
 * Connects a mailbox.
 *
 * The credentials are proven against the server before anything is written, so a typo is
 * reported here rather than as a mysteriously empty sync an hour later. The password is
 * encrypted on the way in and is never returned by any endpoint.
 */
export const POST = withAuth(async (request, { auth }) => {
  const input = await parseBody(request, accountSchema);
  const host = input.host || hostFor(input.email);
  if (!host) {
    throw new ApiError(400, 'לא זיהיתי את ספק המייל — הזן כתובת שרת IMAP ידנית.');
  }

  const port = input.port ?? 993;
  const secure = input.secure ?? true;
  const folder = input.folder || 'INBOX';

  const probe = await testConnection(
    { host, port, secure, user: input.email, password: input.password },
    folder,
  );
  if (!probe.ok) throw new ApiError(400, probe.error);

  const existing = mailboxFor(auth.org.id);
  const fields = {
    email: input.email,
    host,
    port,
    secure: secure ? 1 : 0,
    password_enc: encryptSecret(input.password),
    folder,
    since_date: input.since_date || null,
    last_status: 'ok',
    last_error: null,
    enabled: 1,
  };

  const account = existing
    ? repos.emailAccounts.update(auth.org.id, existing.id, fields)
    : repos.emailAccounts.create(auth.org.id, fields);

  return json({ connected: true, messages: probe.messages, email: account?.email ?? input.email });
}, { limit: 10, windowMs: 60_000 });

export const DELETE = withAuth(async (_request, { auth }) => {
  const account = mailboxFor(auth.org.id);
  if (account) repos.emailAccounts.remove(auth.org.id, account.id);
  return json({ disconnected: true });
});
