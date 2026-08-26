'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Button, EmptyState, cx } from '../ui';
import { ConfirmDialog } from '../ui/Modal';
import { Icon } from '../ui/icons';
import { useToast } from '../ui/Toast';
import { api, errorMessage } from '@/lib/client/api';
import { formatDateTime, whatsappHref } from '@/lib/format';
import { labelOf, MESSAGE_CHANNELS } from '@/lib/domain/constants';

export interface MessageView {
  id: string;
  channel: string;
  direction: 'out' | 'in';
  status: string;
  subject: string | null;
  body: string;
  to_address: string | null;
  created_at: string;
  sent_at: string | null;
  error: string | null;
  candidate_id: string | null;
  client_id: string | null;
  candidate_name: string | null;
  client_name: string | null;
  job_title: string | null;
}

const STATUS_TONE: Record<string, string> = {
  draft: 'amber',
  sent: 'sky',
  delivered: 'emerald',
  read: 'emerald',
  failed: 'rose',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'טיוטה',
  sent: 'נשלח',
  delivered: 'נמסר',
  read: 'נקרא',
  failed: 'נכשל',
};

export function MessageCenter({ messages }: { messages: MessageView[] }) {
  const router = useRouter();
  const toast = useToast();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<MessageView | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.del(`/api/messages/${deleting.id}`);
      toast.success('ההודעה נמחקה');
      setDeleting(null);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function copy(body: string) {
    try {
      await navigator.clipboard.writeText(body);
      toast.success('הטקסט הועתק');
    } catch {
      toast.error('לא הצלחתי להעתיק — סמן והעתק ידנית');
    }
  }

  if (messages.length === 0) {
    return (
      <EmptyState
        icon={<Icon.Chat size={28} />}
        title="אין הודעות להצגה"
        description="הודעות נוצרות מכרטיס המועמד, וגם אוטומטית — למשל טיוטת פתיחה כשמועמד חדש נכנס למאגר."
      />
    );
  }

  return (
    <>
      <ul className="divide-y divide-line">
        {messages.map((message) => {
          const isOpen = expanded === message.id;
          const who = message.candidate_name ?? message.client_name ?? 'ללא שיוך';
          const href = message.candidate_id
            ? `/candidates/${message.candidate_id}`
            : message.client_id
              ? `/clients/${message.client_id}`
              : null;
          const wa = whatsappHref(message.to_address, message.body);

          return (
            <li key={message.id} className="px-4 py-3">
              <div className="flex flex-wrap items-start gap-2">
                <span
                  className={cx(
                    'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                    message.direction === 'in' ? 'bg-ok/12 text-ok' : 'bg-brand-soft text-brand',
                  )}
                  title={message.direction === 'in' ? 'התקבלה' : 'יוצאת'}
                >
                  {message.direction === 'in' ? <Icon.ArrowLeft size={14} /> : <Icon.ArrowRight size={14} />}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {href ? (
                      <Link href={href} className="text-sm font-medium text-ink hover:text-brand">
                        {who}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-ink">{who}</span>
                    )}
                    <Badge tone="slate">{labelOf(MESSAGE_CHANNELS, message.channel)}</Badge>
                    <Badge tone={STATUS_TONE[message.status] ?? 'slate'}>
                      {STATUS_LABEL[message.status] ?? message.status}
                    </Badge>
                    {message.job_title && <span className="text-xs text-faint">· {message.job_title}</span>}
                  </div>

                  {message.subject && (
                    <p className="mt-0.5 text-sm font-medium text-muted">{message.subject}</p>
                  )}
                  <p
                    className={cx(
                      'mt-0.5 whitespace-pre-wrap text-sm text-muted',
                      !isOpen && 'line-clamp-2',
                    )}
                  >
                    {message.body}
                  </p>

                  {message.error && (
                    <p className="mt-1 text-xs text-warn">{message.error}</p>
                  )}

                  <div className="mt-1.5 flex flex-wrap items-center gap-3">
                    <span className="text-xs text-faint">
                      {formatDateTime(message.sent_at ?? message.created_at)}
                    </span>
                    <button
                      onClick={() => setExpanded(isOpen ? null : message.id)}
                      className="text-xs font-medium text-brand"
                    >
                      {isOpen ? 'כיווץ' : 'הצגה מלאה'}
                    </button>
                    <button onClick={() => copy(message.body)} className="text-xs font-medium text-brand">
                      העתקה
                    </button>
                    {wa && message.channel === 'whatsapp' && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-ok"
                      >
                        פתיחה בוואטסאפ
                      </a>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => setDeleting(message)}
                  className="rounded-md p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger"
                  aria-label="מחיקת הודעה"
                >
                  <Icon.Trash size={15} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={deleting !== null}
        title="מחיקת הודעה"
        message="ההודעה תוסר מההיסטוריה של המועמד או הלקוח. הפעולה אינה הפיכה."
        confirmLabel="מחיקה"
        busy={busy}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
