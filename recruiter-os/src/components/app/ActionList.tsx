'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Dot, cx } from '../ui';
import { Icon } from '../ui/icons';
import { api, errorMessage } from '../../lib/client/api';
import { useToast } from '../ui/Toast';
import { whatsappHref } from '../../lib/format';

export type ActionOperation =
  | { type: 'complete_task'; taskId: string }
  | { type: 'message_candidate'; candidateId: string; phone: string; jobId: string | null; label: string }
  | { type: 'mark_paid'; paymentId: string }
  | { type: 'confirm_placement'; placementId: string }
  | { type: 'navigate' };

export interface ActionView {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
  kind: string;
  operation: ActionOperation;
}

const TONE: Record<ActionView['severity'], 'danger' | 'warn' | 'info' | 'muted'> = {
  critical: 'danger',
  high: 'warn',
  medium: 'info',
  low: 'muted',
};

/**
 * The day's work, with the work attached.
 *
 * Each row used to be a link: pressing it took the recruiter to a screen where they still
 * had to find the record and the button. Where an item has one obvious next step —
 * ticking off a task, chasing a candidate who went quiet, recording a payment — it now
 * happens here, and the row disappears. What is left is a list that empties as the
 * morning goes, which is the only version of this screen worth opening every day.
 */
export function ActionList({ actions }: { actions: ActionView[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  async function run(action: ActionView) {
    const operation = action.operation;
    if (operation.type === 'navigate') return;

    setBusyId(action.id);
    // Opened before the awaits: a popup that follows one is blocked, and the button
    // would appear to do nothing at all.
    const tab = operation.type === 'message_candidate' ? window.open('', '_blank') : null;

    try {
      if (operation.type === 'complete_task') {
        await api.patch(`/api/tasks/${operation.taskId}`, { status: 'done' });
        toast.success('המשימה סומנה כבוצעה');
      } else if (operation.type === 'mark_paid') {
        await api.patch(`/api/payments/${operation.paymentId}`, { status: 'paid' });
        toast.success('התשלום סומן כהתקבל');
      } else if (operation.type === 'confirm_placement') {
        await api.post(`/api/placements/${operation.placementId}/start`);
        toast.success('תחילת העבודה אושרה');
      } else {
        const generated = await api.post<{ body: string }>('/api/messages/generate', {
          candidate_id: operation.candidateId,
          job_id: operation.jobId ?? undefined,
          channel: 'whatsapp',
          tone: 'followup',
        });
        const href = whatsappHref(operation.phone, generated.body);
        if (tab && href) tab.location.href = href;
        else tab?.close();

        // Recorded so the same person is not chased twice, and so tomorrow's list knows.
        await api.post('/api/messages', {
          channel: 'whatsapp',
          candidate_id: operation.candidateId,
          job_id: operation.jobId ?? undefined,
          body: generated.body,
        });
        toast.success('ההודעה נשמרה בהיסטוריה');
      }

      setDone((current) => new Set(current).add(action.id));
      router.refresh();
    } catch (caught) {
      tab?.close();
      toast.error(errorMessage(caught));
    } finally {
      setBusyId(null);
    }
  }

  const remaining = actions.filter((action) => !done.has(action.id));

  if (remaining.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
        <Icon.Check size={26} className="text-ok" />
        <p className="text-sm font-medium text-ink">
          {actions.length > 0 ? 'סיימת את הרשימה' : 'אין מה לטפל בו כרגע'}
        </p>
        <p className="text-xs text-faint">
          {actions.length > 0 ? 'כל הכבוד. המערכת תעדכן כשיצוץ משהו חדש.' : 'הכול מעודכן.'}
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line">
      {remaining.map((action) => {
        const inline = action.operation.type !== 'navigate';
        const label =
          action.operation.type === 'message_candidate' ? action.operation.label
          : action.operation.type === 'complete_task' ? 'סמן כבוצע'
          : action.operation.type === 'mark_paid' ? 'סמן כהתקבל'
          : action.operation.type === 'confirm_placement' ? 'אשר התחלה'
          : action.actionLabel;

        return (
          <li key={action.id} className="flex items-start gap-3 px-4 py-3">
            <span className="mt-1.5 shrink-0">
              <Dot tone={TONE[action.severity]} />
            </span>

            <Link href={action.href} className="min-w-0 flex-1 group">
              <span className="block text-sm font-medium text-ink group-hover:text-brand">
                {action.title}
              </span>
              <span className="block text-xs text-muted">{action.detail}</span>
            </Link>

            {inline ? (
              <Button
                size="sm"
                variant={action.severity === 'critical' ? 'primary' : 'secondary'}
                loading={busyId === action.id}
                onClick={() => run(action)}
                className={cx('shrink-0')}
                icon={
                  action.operation.type === 'message_candidate'
                    ? <Icon.Chat size={14} />
                    : <Icon.Check size={14} />
                }
              >
                {label}
              </Button>
            ) : (
              <Link href={action.href} className="shrink-0 pt-1 text-xs font-medium text-brand">
                {action.actionLabel} ←
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
