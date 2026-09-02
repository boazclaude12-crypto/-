import { repos } from '../db/repos';
import { getDb } from '../db/index';
import { newId } from '../ids';
import { nowIso } from '../time';
import { decryptSecret } from '../crypto';
import { parseIntakeEmail } from '../ai/email-intake';
import { importApplication } from '../domain/cv-intake';
import { fetchApplications, describeImapError, type MailboxCredentials } from './imap';
import type { EmailAccountRow } from '../types';

export interface SyncSummary {
  scanned: number;
  imported: number;
  duplicates: number;
  noAttachment: number;
  unreadable: number;
  failed: number;
}

export function mailboxFor(orgId: string): EmailAccountRow | null {
  return repos.emailAccounts.list(orgId, { limit: 1 })[0] ?? null;
}

export function credentialsFor(account: EmailAccountRow): MailboxCredentials | null {
  const password = decryptSecret(account.password_enc);
  if (password === null) return null;
  return {
    host: account.host,
    port: account.port,
    secure: account.secure === 1,
    user: account.email,
    password,
  };
}

function seenUids(orgId: string, accountId: string): Set<string> {
  const rows = getDb().all<{ message_uid: string }>(
    'SELECT message_uid FROM email_messages WHERE org_id = ? AND account_id = ?',
    orgId, accountId,
  );
  return new Set(rows.map((row) => row.message_uid));
}

/**
 * Pulls new applications out of the connected mailbox and files them.
 *
 * Every message that is looked at is recorded, including the ones that produce no
 * candidate — no attachment, an applicant already on file, a CV that could not be read.
 * Without that record the next sync would reconsider them forever, and the recruiter
 * would have no way to see why a message they remember receiving never became a lead.
 *
 * The mailbox is never modified: nothing is marked read, moved or deleted. It is the
 * recruiter's inbox, and a sync that reorganised it would be a nasty surprise.
 */
export async function syncMailbox(
  orgId: string,
  userId: string,
  options: { limit?: number } = {},
): Promise<{ summary: SyncSummary; error: string | null }> {
  const account = mailboxFor(orgId);
  const empty: SyncSummary = {
    scanned: 0, imported: 0, duplicates: 0, noAttachment: 0, unreadable: 0, failed: 0,
  };
  if (!account) return { summary: empty, error: 'לא מחוברת תיבת מייל' };

  const credentials = credentialsFor(account);
  if (!credentials) {
    return { summary: empty, error: 'לא ניתן לקרוא את סיסמת התיבה — חבר אותה מחדש.' };
  }

  const summary = { ...empty };
  let error: string | null = null;

  try {
    const messages = await fetchApplications(credentials, {
      folder: account.folder,
      since: account.since_date ? new Date(account.since_date) : undefined,
      seenUids: seenUids(orgId, account.id),
      limit: options.limit ?? 50,
    });

    for (const message of messages) {
      // Reading a CV is synchronous work — inflating a document, running the parser over
      // it — and this process also serves every page. Without yielding between messages a
      // sync of thirty attachments freezes the site for whoever is using it.
      await new Promise((resolve) => setImmediate(resolve));

      summary.scanned += 1;
      const intake = parseIntakeEmail({
        subject: message.subject,
        body: message.text,
        from: message.from,
      });

      const hints = {
        first_name: intake.first_name,
        last_name: intake.last_name,
        city: intake.city,
        phone: intake.phone,
        // A board relays replies through its own address, so only a direct application
        // carries an address that belongs to the candidate.
        email: intake.source === 'generic' ? (intake.email ?? message.from) : intake.email,
        job_title: intake.job_title,
      };

      const attachment = message.attachments[0] ?? null;
      // An application with no readable CV but a name and a phone is still a real lead.
      const hasIdentity = !!(hints.first_name || hints.phone || hints.email);

      let status: string;
      let candidateId: string | null = null;
      let reason: string | null = null;

      if (!attachment && !hasIdentity) {
        status = 'no_attachment';
        reason = 'אין קובץ מצורף ואין פרטי קשר בגוף המייל';
        summary.noAttachment += 1;
      } else {
        const outcome = await importApplication(orgId, userId, {
          document: attachment
            ? { buffer: attachment.buffer, fileName: attachment.fileName, mimeType: attachment.mimeType }
            : undefined,
          hints,
          note: intake.job_title
            ? `פנייה למשרת "${intake.job_title}" — התקבל במייל ${message.date?.slice(0, 10) ?? ''}`.trim()
            : `התקבל במייל ${message.date?.slice(0, 10) ?? ''}`.trim(),
        });
        candidateId = outcome.candidateId;
        reason = outcome.reason;
        status = outcome.status === 'created' ? 'imported' : outcome.status;
        if (outcome.status === 'created') summary.imported += 1;
        else if (outcome.status === 'duplicate') summary.duplicates += 1;
        else if (outcome.status === 'unreadable') summary.unreadable += 1;
        else summary.failed += 1;
      }

      repos.emailMessages.create(orgId, {
        id: newId('eml'),
        account_id: account.id,
        message_uid: message.uid,
        message_id: message.messageId,
        subject: message.subject,
        sender: message.from,
        received_at: message.date,
        status,
        candidate_id: candidateId,
        job_title: intake.job_title,
        reason,
      });
    }
  } catch (caught) {
    error = describeImapError(caught);
  }

  repos.emailAccounts.update(orgId, account.id, {
    last_sync_at: nowIso(),
    last_status: error ? 'error' : 'ok',
    last_error: error,
  });

  return { summary, error };
}

/** How often the background sync runs. Frequent enough that an application shows up
 *  while it is still worth calling about, rare enough not to hammer the mail server. */
export const SYNC_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Syncs every connected mailbox.
 *
 * Runs against the organisation's owner, because the sync acts on the account's behalf
 * rather than on behalf of whoever happens to be signed in — there may be nobody signed
 * in at all when this fires.
 */
export async function syncAllMailboxes(): Promise<Array<{ orgId: string; summary: SyncSummary; error: string | null }>> {
  const accounts = getDb().all<{ org_id: string; user_id: string | null }>(
    `SELECT a.org_id,
            (SELECT user_id FROM memberships m WHERE m.org_id = a.org_id ORDER BY m.created_at LIMIT 1) AS user_id
       FROM email_accounts a
      WHERE a.enabled = 1`,
  );

  const results = [];
  for (const account of accounts) {
    if (!account.user_id) continue;
    try {
      const result = await syncMailbox(account.org_id, account.user_id, { limit: 30 });
      results.push({ orgId: account.org_id, ...result });
    } catch (caught) {
      // One unreachable mailbox must not stop the others.
      results.push({
        orgId: account.org_id,
        summary: { scanned: 0, imported: 0, duplicates: 0, noAttachment: 0, unreadable: 0, failed: 0 },
        error: caught instanceof Error ? caught.message : 'שגיאה לא ידועה',
      });
    }
  }
  return results;
}
