import { getDb } from '../db/index';
import { nextBestActions, type NextAction } from '../domain/next-best-action';
import type { OutgoingMail } from './send';

export interface Brief {
  actions: NextAction[];
  /** Candidates the mailbox brought in since the last brief. */
  newCandidates: number;
  interviewsToday: number;
  hasAnything: boolean;
}

const SEVERITY_COLOR: Record<NextAction['severity'], string> = {
  critical: '#b3261e',
  high: '#b45309',
  medium: '#8a6d0b',
  low: '#3f6212',
};

export function buildBrief(orgId: string): Brief {
  const db = getDb();
  const actions = nextBestActions(orgId, 8);

  const newCandidates = db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM candidates
      WHERE org_id = ? AND created_at >= datetime('now', '-1 day')`,
    orgId,
  )?.n ?? 0;

  const interviewsToday = db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM interviews
      WHERE org_id = ? AND date(scheduled_at) = date('now') AND status NOT IN ('cancelled','done')`,
    orgId,
  )?.n ?? 0;

  return {
    actions,
    newCandidates,
    interviewsToday,
    // Nothing to report means no mail. A daily message that says "nothing today" trains
    // the recipient to stop opening it, and then the one that matters goes unread too.
    hasAnything: actions.length > 0 || newCandidates > 0 || interviewsToday > 0,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!,
  );
}

/**
 * Renders the brief as mail.
 *
 * Inline styles and a table, because that is what mail clients render: Gmail strips a
 * stylesheet, and Outlook ignores flex and grid outright. Plain text is sent alongside,
 * for the clients and watches that show only that.
 */
export function renderBrief(brief: Brief, options: { to: string; baseUrl: string }): OutgoingMail {
  const date = new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });

  /** Hebrew does not say "1 ראיונות"; a subject line read every morning has to agree. */
  const count = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

  const headline = [
    brief.newCandidates > 0 ? count(brief.newCandidates, 'מועמד חדש אחד', 'מועמדים חדשים') : null,
    brief.interviewsToday > 0 ? count(brief.interviewsToday, 'ראיון אחד היום', 'ראיונות היום') : null,
    brief.actions.length > 0 ? count(brief.actions.length, 'דבר אחד לטפל בו', 'דברים לטפל בהם') : null,
  ].filter(Boolean).join(' · ');

  const rows = brief.actions
    .map(
      (action) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;">
          <div style="border-right:3px solid ${SEVERITY_COLOR[action.severity]};padding-right:12px;">
            <div style="font-size:15px;font-weight:600;color:#111827;">${escapeHtml(action.title)}</div>
            <div style="font-size:13px;color:#6b7280;margin-top:2px;">${escapeHtml(action.detail)}</div>
            <a href="${options.baseUrl}${action.href}"
               style="font-size:13px;color:#0f766e;text-decoration:none;font-weight:600;">
              ${escapeHtml(action.actionLabel)} ←
            </a>
          </div>
        </td>
      </tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html dir="rtl" lang="he"><body style="margin:0;padding:24px 12px;background:#f8fafc;font-family:Arial,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;">
    <tr><td style="padding:24px 24px 8px;">
      <div style="font-size:12px;color:#6b7280;">${escapeHtml(date)}</div>
      <div style="font-size:20px;font-weight:700;color:#111827;margin-top:4px;">הבוקר שלך</div>
      ${headline ? `<div style="font-size:14px;color:#0f766e;margin-top:6px;font-weight:600;">${escapeHtml(headline)}</div>` : ''}
    </td></tr>
    <tr><td style="padding:0 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
    </td></tr>
    <tr><td style="padding:20px 24px 24px;">
      <a href="${options.baseUrl}/dashboard"
         style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;">
        פתיחת המערכת
      </a>
      <div style="font-size:11px;color:#9ca3af;margin-top:16px;">
        נשלח מהמערכת שלך. אפשר לכבות בהגדרות ← קליטת מועמדים מהמייל.
      </div>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    `הבוקר שלך — ${date}`,
    headline,
    '',
    ...brief.actions.map((action) => `• ${action.title}\n  ${action.detail}\n  ${options.baseUrl}${action.href}`),
    '',
    `${options.baseUrl}/dashboard`,
  ]
    .filter((line) => line !== null)
    .join('\n');

  return {
    to: options.to,
    subject: headline ? `הבוקר שלך — ${headline}` : 'הבוקר שלך',
    text,
    html,
  };
}
