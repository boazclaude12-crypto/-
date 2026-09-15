'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Card, Input, cx } from '../ui';
import { Icon } from '../ui/icons';
import { useToast } from '../ui/Toast';
import { api, errorMessage } from '@/lib/client/api';

export interface AutomationView {
  id: string;
  key: string;
  name: string;
  description: string | null;
  trigger_event: string;
  action_type: string;
  delay_minutes: number;
  is_enabled: boolean;
}

const TRIGGER_LABELS: Record<string, string> = {
  'candidate.created': 'מועמד נוסף למאגר',
  'candidate.status_changed': 'סטטוס מועמד השתנה',
  'message.sent': 'נשלחה הודעה',
  'application.sent_to_client': 'מועמד נשלח ללקוח',
  'application.rejected': 'מועמד נדחה',
  'interview.scheduled': 'נקבע ראיון',
  'placement.created': 'נרשמה השמה',
  'placement.started': 'מועמד התחיל לעבוד',
};

const ACTION_LABELS: Record<string, string> = {
  create_task: 'יצירת משימה',
  create_reminder: 'יצירת תזכורת',
  draft_message: 'הכנת טיוטת הודעה',
};

function delayLabel(minutes: number): string {
  if (minutes === 0) return 'מיד';
  if (minutes < 60) return `אחרי ${minutes} דקות`;
  if (minutes < 60 * 24) return `אחרי ${Math.round(minutes / 60)} שעות`;
  return `אחרי ${Math.round(minutes / (60 * 24))} ימים`;
}

/** Each row writes straight through: the toggle and the delay are the stored config. */
export function AutomationList({ automations }: { automations: AutomationView[] }) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(automations);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function patch(id: string, values: Record<string, unknown>, optimistic: Partial<AutomationView>) {
    const previous = items;
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...optimistic } : item)));
    setBusyId(id);
    try {
      await api.patch(`/api/automations/${id}`, values);
      router.refresh();
    } catch (error) {
      setItems(previous);
      toast.error(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {items.map((automation) => (
        <Card key={automation.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{automation.name}</p>
              {automation.description && (
                <p className="mt-0.5 text-sm text-muted">{automation.description}</p>
              )}
            </div>

            <button
              role="switch"
              aria-checked={automation.is_enabled}
              aria-label={`הפעלת ${automation.name}`}
              disabled={busyId === automation.id}
              onClick={() =>
                patch(
                  automation.id,
                  { is_enabled: !automation.is_enabled },
                  { is_enabled: !automation.is_enabled },
                )
              }
              className={cx(
                'relative h-6 w-11 shrink-0 rounded-full transition',
                automation.is_enabled ? 'bg-brand' : 'bg-line',
              )}
            >
              <span
                className={cx(
                  'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
                  automation.is_enabled ? 'right-0.5' : 'right-[1.375rem]',
                )}
              />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Badge tone="sky">
              <Icon.Bolt size={11} />
              {TRIGGER_LABELS[automation.trigger_event] ?? automation.trigger_event}
            </Badge>
            <span className="text-xs text-faint">←</span>
            <Badge tone="violet">{ACTION_LABELS[automation.action_type] ?? automation.action_type}</Badge>
          </div>

          <label className="mt-3 flex items-center gap-2">
            <span className="shrink-0 text-xs text-muted">השהיה (דקות)</span>
            <Input
              type="number"
              min={0}
              className="h-8 w-24 text-sm"
              defaultValue={automation.delay_minutes}
              disabled={busyId === automation.id}
              onBlur={(event) => {
                const value = Number(event.target.value);
                if (!Number.isFinite(value) || value === automation.delay_minutes) return;
                patch(automation.id, { delay_minutes: value }, { delay_minutes: value });
              }}
            />
            <span className="text-xs text-faint">{delayLabel(automation.delay_minutes)}</span>
          </label>
        </Card>
      ))}
    </div>
  );
}
