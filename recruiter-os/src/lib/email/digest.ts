import { repos } from '../db/repos';
import { getDb } from '../db/index';
import { env } from '../env';
import { buildBrief, renderBrief } from './brief';
import { sendMail } from './send';
import type { EmailAccountRow } from '../types';

/** Local date as YYYY-MM-DD, used to guarantee one brief per day. */
function today(): string {
  return new Date().toLocaleDateString('sv-SE');
}

/**
 * Sends one account's brief.
 *
 * Returns why it did nothing when it does nothing, so the caller can say so rather than
 * reporting a silent success — a digest that never arrives and never errors is the worst
 * of both.
 */
export async function sendDigest(
  account: EmailAccountRow,
  options: { force?: boolean } = {},
): Promise<{ sent: boolean; reason: string | null }> {
  if (!options.force && account.digest_hour === null) return { sent: false, reason: 'הסיכום כבוי' };
  if (!options.force && account.last_digest_on === today()) {
    return { sent: false, reason: 'כבר נשלח היום' };
  }

  const brief = buildBrief(account.org_id);
  if (!brief.hasAnything && !options.force) {
    // Still marked as done for today: a quiet day should not leave the scheduler
    // retrying every hour looking for something to say.
    repos.emailAccounts.update(account.org_id, account.id, { last_digest_on: today() });
    return { sent: false, reason: 'אין מה לדווח היום' };
  }

  const mail = renderBrief(brief, { to: account.email, baseUrl: env.appUrl });
  const result = await sendMail(account, mail);

  if (result.ok) {
    repos.emailAccounts.update(account.org_id, account.id, { last_digest_on: today() });
    return { sent: true, reason: null };
  }
  repos.emailAccounts.update(account.org_id, account.id, { last_error: result.error });
  return { sent: false, reason: result.error };
}

/**
 * Sends the brief to every account whose chosen hour has arrived.
 *
 * The hour is compared rather than scheduled to it: the process restarts on every deploy,
 * and a timer set for 07:00 would be lost each time. Checking on each tick makes the
 * schedule survive restarts, and `last_digest_on` keeps it to one a day.
 */
export async function runDueDigests(): Promise<Array<{ orgId: string; sent: boolean; reason: string | null }>> {
  const hour = new Date().getHours();
  const accounts = getDb().all<EmailAccountRow>(
    `SELECT * FROM email_accounts
      WHERE enabled = 1 AND digest_hour IS NOT NULL AND digest_hour <= ?
        AND (last_digest_on IS NULL OR last_digest_on <> ?)`,
    hour, today(),
  );

  const results = [];
  for (const account of accounts) {
    try {
      const result = await sendDigest(account);
      results.push({ orgId: account.org_id, ...result });
    } catch (caught) {
      results.push({
        orgId: account.org_id,
        sent: false,
        reason: caught instanceof Error ? caught.message : 'שגיאה לא ידועה',
      });
    }
  }
  return results;
}
