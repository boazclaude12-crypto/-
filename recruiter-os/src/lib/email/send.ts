import nodemailer from 'nodemailer';
import { decryptSecret } from '../crypto';
import type { EmailAccountRow } from '../types';

/** IMAP host → the sending host of the same provider. */
const SMTP_HOSTS: Record<string, string> = {
  'imap.gmail.com': 'smtp.gmail.com',
  'outlook.office365.com': 'smtp.office365.com',
  'imap.mail.yahoo.com': 'smtp.mail.yahoo.com',
  'imap.walla.co.il': 'smtp.walla.co.il',
};

/**
 * Where to send from, for a mailbox that was connected for reading.
 *
 * Derived rather than asked for: the recruiter already proved one credential works, and
 * a second form asking for a sending server is where a setup gets abandoned. An explicit
 * value still wins for anyone whose provider does not follow the pattern.
 */
export function smtpSettingsFor(account: EmailAccountRow): {
  host: string; port: number; secure: boolean; user: string; password: string;
} | null {
  const password = decryptSecret(account.password_enc);
  if (password === null) return null;

  const host = account.smtp_host || SMTP_HOSTS[account.host] || account.host.replace(/^imap\./, 'smtp.');
  const port = account.smtp_port || 465;
  return { host, port, secure: port === 465, user: account.email, password };
}

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Sends one message through the connected mailbox.
 *
 * Failures are returned rather than thrown: a brief that could not go out must not take
 * down the scheduled run that produced it, and the reason belongs in the account's status
 * where the recruiter can see it.
 */
export async function sendMail(
  account: EmailAccountRow,
  mail: OutgoingMail,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const settings = smtpSettingsFor(account);
  if (!settings) return { ok: false, error: 'לא ניתן לקרוא את סיסמת התיבה — חבר אותה מחדש.' };

  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: { user: settings.user, pass: settings.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
  });

  try {
    await transport.sendMail({
      from: `Recruiter OS <${account.email}>`,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    return { ok: true };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    if (/auth|credential|535/i.test(message)) {
      return { ok: false, error: 'השליחה נדחתה. בגיימייל נדרשת סיסמת אפליקציה גם לשליחה.' };
    }
    return { ok: false, error: message };
  } finally {
    transport.close();
  }
}
