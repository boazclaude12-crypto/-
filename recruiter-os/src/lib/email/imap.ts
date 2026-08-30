import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export interface MailboxCredentials {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
}

export interface FetchedAttachment {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}

export interface FetchedMessage {
  uid: string;
  messageId: string | null;
  subject: string | null;
  from: string | null;
  date: string | null;
  text: string;
  attachments: FetchedAttachment[];
}

/** Extensions the CV importer can actually read; anything else is not worth downloading. */
const CV_EXTENSIONS = /\.(pdf|docx|txt|rtf)$/i;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * Opens the mailbox and closes it again, whatever happens in between.
 *
 * IMAP connections are stateful, and a leaked one holds a session open on the server
 * until it times out — which for Gmail counts against a small concurrent-connection
 * limit, so the next sync would start failing for no visible reason.
 */
async function withMailbox<T>(
  credentials: MailboxCredentials,
  folder: string,
  fn: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  const client = new ImapFlow({
    host: credentials.host,
    port: credentials.port,
    secure: credentials.secure,
    auth: { user: credentials.user, pass: credentials.password },
    logger: false,
    // A mailbox that never answers must not hold a web request open indefinitely.
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock(folder);
    try {
      return await fn(client);
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }
}

/**
 * Turns an IMAP failure into something the person who typed the password can act on.
 *
 * The raw errors are protocol-level and unhelpful — "Invalid credentials (Failure)" says
 * nothing about app passwords, which is almost always the real cause with Gmail.
 */
export function describeImapError(caught: unknown): string {
  const message = caught instanceof Error ? caught.message : String(caught);
  if (/auth|credential|login|AUTHENTICATIONFAILED/i.test(message)) {
    return 'ההתחברות נדחתה. בגיימייל צריך סיסמת אפליקציה (App Password) — לא סיסמת החשבון הרגילה.';
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) return 'לא נמצא שרת בכתובת שהוזנה.';
  if (/ECONNREFUSED/i.test(message)) return 'השרת סירב לחיבור — בדוק את הפורט.';
  if (/timeout|ETIMEDOUT/i.test(message)) return 'השרת לא הגיב בזמן.';
  if (/certificate|self.signed/i.test(message)) return 'תעודת האבטחה של השרת אינה תקינה.';
  if (/NONEXISTENT|Mailbox doesn't exist/i.test(message)) return 'התיקייה שביקשת לא קיימת בתיבה.';
  return message;
}

/**
 * Verifies credentials without importing anything.
 *
 * Kept separate from the sync so the connection form can distinguish "the password is
 * wrong" from "the password is right but nothing matched" — identical from a result
 * count alone, and very different to act on.
 */
export async function testConnection(
  credentials: MailboxCredentials,
  folder = 'INBOX',
): Promise<{ ok: true; messages: number } | { ok: false; error: string }> {
  try {
    const messages = await withMailbox(credentials, folder, async (client) => {
      const status = await client.status(folder, { messages: true });
      return status.messages ?? 0;
    });
    return { ok: true, messages };
  } catch (caught) {
    return { ok: false, error: describeImapError(caught) };
  }
}

/**
 * Fetches messages that may carry an application.
 *
 * Filtered on the server by date rather than downloaded and sifted here: connecting a
 * mailbox with years of history should not pull years of mail over the wire. `seenUids`
 * skips whatever a previous run already handled, so a sync is resumable and re-running
 * one is harmless.
 */
export async function fetchApplications(
  credentials: MailboxCredentials,
  options: { folder?: string; since?: Date; seenUids: Set<string>; limit?: number },
): Promise<FetchedMessage[]> {
  const folder = options.folder ?? 'INBOX';
  const limit = options.limit ?? 50;

  return withMailbox(credentials, folder, async (client) => {
    const since = options.since ?? new Date(Date.now() - 90 * 86_400_000);
    const uids = await client.search({ since }, { uid: true });
    if (!uids || uids.length === 0) return [];

    // Newest first: a first sync on a large mailbox should surface recent applications,
    // not whichever ones happen to be oldest.
    const pending = uids
      .map(String)
      .filter((uid) => !options.seenUids.has(uid))
      .sort((a, b) => Number(b) - Number(a))
      .slice(0, limit);
    if (pending.length === 0) return [];

    const messages: FetchedMessage[] = [];
    for await (const message of client.fetch(pending.join(','), { uid: true, source: true }, { uid: true })) {
      if (!message.source) continue;
      const parsed = await simpleParser(message.source);

      const attachments: FetchedAttachment[] = [];
      for (const attachment of parsed.attachments ?? []) {
        const fileName = attachment.filename ?? '';
        if (!CV_EXTENSIONS.test(fileName)) continue;
        if (attachment.content.length > MAX_ATTACHMENT_BYTES) continue;
        attachments.push({
          fileName,
          mimeType: attachment.contentType || 'application/octet-stream',
          buffer: attachment.content,
        });
      }

      messages.push({
        uid: String(message.uid),
        messageId: parsed.messageId ?? null,
        subject: parsed.subject ?? null,
        from: parsed.from?.value?.[0]?.address ?? null,
        date: parsed.date ? parsed.date.toISOString() : null,
        text: parsed.text || (typeof parsed.html === 'string' ? parsed.html : '') || '',
        attachments,
      });
    }
    return messages;
  });
}
