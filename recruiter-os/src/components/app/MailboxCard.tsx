'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, ErrorNote, Field, Input, Select, Spinner, cx } from '../ui';
import { Icon } from '../ui/icons';
import { api, errorMessage } from '../../lib/client/api';
import { useToast } from '../ui/Toast';

interface AccountView {
  email: string;
  host: string;
  port: number;
  folder: string;
  since_date: string | null;
  last_sync_at: string | null;
  last_status: string | null;
  last_error: string | null;
  digest_hour: number | null;
}

interface SyncSummary {
  scanned: number;
  imported: number;
  duplicates: number;
  noAttachment: number;
  unreadable: number;
  failed: number;
}

interface MessageRow {
  id: string;
  subject: string | null;
  sender: string | null;
  received_at: string | null;
  status: string;
  job_title: string | null;
  reason: string | null;
  candidate_id: string | null;
  first_name: string | null;
  last_name: string | null;
}

const STATUS_META: Record<string, { tone: 'emerald' | 'sky' | 'amber' | 'rose' | 'slate'; label: string }> = {
  imported: { tone: 'emerald', label: 'נקלט' },
  duplicate: { tone: 'sky', label: 'כבר קיים' },
  no_attachment: { tone: 'slate', label: 'ללא קו"ח' },
  unreadable: { tone: 'amber', label: 'לא נקרא' },
  failed: { tone: 'rose', label: 'נכשל' },
};

function since(value: string | null): string {
  if (!value) return 'עדיין לא';
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'ממש עכשיו';
  if (minutes < 60) return `לפני ${minutes} דקות`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  return new Date(value).toLocaleDateString('he-IL');
}

/**
 * Connects the mailbox applications arrive in, and shows what the sync did with each
 * message — including the ones that produced nothing, which is where the questions are.
 */
export function MailboxCard() {
  const router = useRouter();
  const toast = useToast();
  const [account, setAccount] = useState<AccountView | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [savingDigest, setSavingDigest] = useState(false);
  const [testingDigest, setTestingDigest] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', host: '', since_date: '' });

  async function load() {
    try {
      const result = await api.get<{ account: AccountView | null }>('/api/email/account');
      setAccount(result.account);
    } catch {
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function loadMessages() {
    try {
      const result = await api.get<{ messages: MessageRow[] }>('/api/email/messages?limit=30');
      setMessages(result.messages);
      setShowLog(true);
    } catch (caught) {
      toast.error(errorMessage(caught));
    }
  }

  async function connect(event: React.FormEvent) {
    event.preventDefault();
    setConnecting(true);
    setError(null);
    try {
      await api.post('/api/email/account', {
        email: form.email.trim(),
        password: form.password,
        host: form.host.trim() || undefined,
        since_date: form.since_date || undefined,
      });
      toast.success('התיבה חוברה');
      setForm({ email: '', password: '', host: '', since_date: '' });
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setConnecting(false);
    }
  }

  async function sync() {
    setSyncing(true);
    setError(null);
    try {
      const result = await api.post<{ summary: SyncSummary; error: string | null }>('/api/email/sync');
      setSummary(result.summary);
      if (result.error) setError(result.error);
      else if (result.summary.imported > 0) {
        toast.success(`נקלטו ${result.summary.imported} מועמדים חדשים`);
        router.refresh();
      } else {
        toast.info('אין פניות חדשות');
      }
      await load();
      if (showLog) await loadMessages();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSyncing(false);
    }
  }

  async function setDigestHour(hour: number | null) {
    setSavingDigest(true);
    try {
      await api.patch('/api/email/digest', { hour });
      toast.success(hour === null ? 'סיכום הבוקר כובה' : `הסיכום יישלח כל יום ב-${hour}:00`);
      await load();
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setSavingDigest(false);
    }
  }

  async function sendTestDigest() {
    setTestingDigest(true);
    try {
      const result = await api.post<{ to: string }>('/api/email/digest');
      toast.success(`נשלח ל-${result.to}`);
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setTestingDigest(false);
    }
  }

  async function disconnect() {
    if (!window.confirm('לנתק את התיבה? המועמדים שכבר נקלטו יישארו.')) return;
    try {
      await api.del('/api/email/account');
      setAccount(null);
      setSummary(null);
      toast.success('התיבה נותקה');
    } catch (caught) {
      toast.error(errorMessage(caught));
    }
  }

  if (loading) {
    return (
      <Card title="קליטת מועמדים מהמייל">
        <Spinner className="h-5 w-5 text-faint" />
      </Card>
    );
  }

  if (!account) {
    return (
      <Card title="קליטת מועמדים מהמייל">
        <p className="text-sm text-muted">
          חבר את תיבת המייל שאליה מגיעות הפניות. המערכת תמשוך לבד קורות חיים חדשים, תקרא אותם
          ותיצור מועמדים — כולל מיילים של אלג׳ובס, שמהם נקראים גם השם, העיר, הטלפון והמשרה
          שאליה פנו.
        </p>

        <div className="mt-3 rounded-lg bg-brand-soft px-3 py-2.5 text-xs text-brand">
          <p className="font-medium">בגיימייל צריך &quot;סיסמת אפליקציה&quot; — לא הסיסמה הרגילה</p>
          <p className="mt-1 leading-relaxed">
            בחשבון Google → אבטחה → הפעל אימות דו-שלבי → חפש &quot;סיסמאות אפליקציות&quot; → צור אחת.
            תקבל 16 תווים. זו הסיסמה שמדביקים כאן. אפשר לבטל אותה בכל רגע בלי לשנות את סיסמת החשבון.
          </p>
        </div>

        <form onSubmit={connect} className="mt-4 space-y-3">
          <ErrorNote>{error}</ErrorNote>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="כתובת המייל" required>
              <Input
                type="email"
                dir="ltr"
                value={form.email}
                onChange={(event) => setForm((f) => ({ ...f, email: event.target.value }))}
                placeholder="you@gmail.com"
              />
            </Field>
            <Field label="סיסמת אפליקציה" required>
              <Input
                type="password"
                dir="ltr"
                value={form.password}
                onChange={(event) => setForm((f) => ({ ...f, password: event.target.value }))}
                placeholder="abcd efgh ijkl mnop"
              />
            </Field>
            <Field label="לקלוט פניות מתאריך" hint="ריק = 90 הימים האחרונים">
              <Input
                type="date"
                value={form.since_date}
                onChange={(event) => setForm((f) => ({ ...f, since_date: event.target.value }))}
              />
            </Field>
            <Field label="שרת IMAP" hint="ריק = זיהוי אוטומטי לפי הכתובת">
              <Input
                dir="ltr"
                value={form.host}
                onChange={(event) => setForm((f) => ({ ...f, host: event.target.value }))}
                placeholder="imap.gmail.com"
              />
            </Field>
          </div>
          <Button type="submit" loading={connecting} icon={<Icon.Mail size={16} />}>
            חיבור ובדיקה
          </Button>
          <p className="text-xs text-faint">
            הסיסמה נשמרת מוצפנת בשרת שלך ולא נשלחת לשום מקום אחר. המערכת רק קוראת — היא לא
            מסמנת, מוחקת או מזיזה שום דבר בתיבה.
          </p>
        </form>
      </Card>
    );
  }

  return (
    <Card
      title="קליטת מועמדים מהמייל"
      action={
        <Badge tone={account.last_status === 'error' ? 'rose' : 'emerald'}>
          {account.last_status === 'error' ? 'תקלה' : 'מחובר'}
        </Badge>
      }
    >
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-faint">תיבה</dt>
          <dd className="text-ink" dir="ltr">{account.email}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-faint">סנכרון אחרון</dt>
          <dd className="text-ink">{since(account.last_sync_at)}</dd>
        </div>
      </dl>

      {account.last_error && (
        <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{account.last_error}</p>
      )}
      <ErrorNote>{error}</ErrorNote>

      {summary && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone="emerald">{summary.imported} נקלטו</Badge>
          {summary.duplicates > 0 && <Badge tone="sky">{summary.duplicates} כבר קיימים</Badge>}
          {summary.noAttachment > 0 && <Badge tone="slate">{summary.noAttachment} ללא קו&quot;ח</Badge>}
          {summary.unreadable > 0 && <Badge tone="amber">{summary.unreadable} לא נקראו</Badge>}
          {summary.failed > 0 && <Badge tone="rose">{summary.failed} נכשלו</Badge>}
          {summary.scanned === 0 && <span className="text-sm text-faint">אין פניות חדשות</span>}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button loading={syncing} onClick={sync} icon={<Icon.Sparkles size={16} />}>
          משיכה עכשיו
        </Button>
        <Button variant="secondary" onClick={showLog ? () => setShowLog(false) : loadMessages}>
          {showLog ? 'הסתרת יומן' : 'מה נקלט'}
        </Button>
        <Button variant="ghost" onClick={disconnect}>ניתוק</Button>
      </div>

      <p className="mt-2 text-xs text-faint">
        המערכת בודקת את התיבה כל רבע שעה גם בלי שתלחץ.
      </p>

      <div className="mt-4 rounded-xl border border-line bg-canvas/50 p-3">
        <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-ink">
          <Icon.Clock size={14} className="text-faint" />
          סיכום בוקר
        </p>
        <p className="mb-2.5 text-xs text-muted">
          מייל יומי עם מה שצריך לטפל בו: מועמדים שמחכים לתשובה, ראיונות היום, משרות
          שעומדות וכסף שלא נגבה. ביום שאין מה לדווח — לא נשלח כלום.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            options={[
              { value: '', label: 'כבוי' },
              ...Array.from({ length: 24 }, (_, hour) => ({
                value: String(hour),
                label: `${String(hour).padStart(2, '0')}:00`,
              })),
            ]}
            value={account.digest_hour === null ? '' : String(account.digest_hour)}
            disabled={savingDigest}
            onChange={(event) =>
              setDigestHour(event.target.value === '' ? null : Number(event.target.value))
            }
            className="w-32"
          />
          <Button
            variant="secondary"
            size="sm"
            loading={testingDigest}
            onClick={sendTestDigest}
            icon={<Icon.Mail size={14} />}
          >
            שלח לי עכשיו
          </Button>
        </div>
      </div>

      {showLog && (
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
          {messages.length === 0 && (
            <li className="px-3 py-4 text-center text-sm text-faint">עדיין לא נסרקו מיילים</li>
          )}
          {messages.map((message) => {
            const meta = STATUS_META[message.status] ?? STATUS_META.failed!;
            const name = [message.first_name, message.last_name].filter(Boolean).join(' ');
            return (
              <li key={message.id} className="flex items-center gap-3 px-3 py-2.5">
                <Badge tone={meta.tone}>{meta.label}</Badge>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">
                    {name || message.subject || message.sender || '—'}
                  </span>
                  <span className="block truncate text-xs text-faint">
                    {[message.job_title, message.reason, message.sender].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {message.candidate_id && (
                  <Button variant="ghost" size="sm" onClick={() => router.push(`/candidates/${message.candidate_id}`)}>
                    פתיחה
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
