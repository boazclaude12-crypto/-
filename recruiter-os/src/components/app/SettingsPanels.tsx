'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, Field, Input, Select } from '../ui';
import { Icon } from '../ui/icons';
import { useToast } from '../ui/Toast';
import { api, errorMessage } from '@/lib/client/api';

export interface StageView {
  id: string;
  key: string;
  label: string;
  color: string;
  in_pipeline: boolean;
  is_system: boolean;
}

const COLORS = [
  { value: 'slate', label: 'אפור' },
  { value: 'sky', label: 'תכלת' },
  { value: 'indigo', label: 'כחול' },
  { value: 'violet', label: 'סגול' },
  { value: 'amber', label: 'כתום' },
  { value: 'emerald', label: 'ירוק' },
  { value: 'rose', label: 'אדום' },
];

/** Stages are shared by candidate status and the kanban columns, so adding one affects both. */
export function StageEditor({ stages }: { stages: StageView[] }) {
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ key: '', label: '', color: 'sky', in_pipeline: true });

  async function add() {
    if (!draft.key.trim() || !draft.label.trim()) {
      toast.error('יש להזין מפתח ושם לשלב');
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/stages', {
        key: draft.key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        label: draft.label.trim(),
        color: draft.color,
        in_pipeline: draft.in_pipeline,
      });
      toast.success('השלב נוסף');
      setDraft({ key: '', label: '', color: 'sky', in_pipeline: true });
      setAdding(false);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <ol className="flex flex-wrap items-center gap-1.5">
        {stages.map((stage, index) => (
          <li key={stage.id} className="flex items-center gap-1.5">
            <Badge tone={stage.color}>
              {stage.label}
              {!stage.in_pipeline && <span className="opacity-60"> (מחוץ לקנבן)</span>}
            </Badge>
            {index < stages.length - 1 && <span className="text-xs text-faint">←</span>}
          </li>
        ))}
      </ol>

      {adding ? (
        <div className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-4">
          <Field label="שם השלב">
            <Input
              value={draft.label}
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
              placeholder="מבחן מקצועי"
            />
          </Field>
          <Field label="מפתח (אנגלית)">
            <Input
              value={draft.key}
              onChange={(event) => setDraft({ ...draft, key: event.target.value })}
              placeholder="skill_test"
              dir="ltr"
            />
          </Field>
          <Field label="צבע">
            <Select
              options={COLORS}
              value={draft.color}
              onChange={(event) => setDraft({ ...draft, color: event.target.value })}
            />
          </Field>
          <div className="flex items-end gap-2">
            <Button onClick={add} loading={busy}>הוספה</Button>
            <Button variant="secondary" onClick={() => setAdding(false)}>ביטול</Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" icon={<Icon.Plus size={15} />} onClick={() => setAdding(true)}>
          הוספת שלב
        </Button>
      )}
    </div>
  );
}

/** Fills an empty account with a full demo desk so the product can be evaluated instantly. */
export function DemoDataCard({ hasData }: { hasData: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function seed() {
    setBusy(true);
    try {
      const result = await api.post<{ seeded: Record<string, number> }>('/api/demo/seed');
      toast.success(
        `נטענו ${result.seeded.candidates} מועמדים, ${result.seeded.jobs} משרות ו-${result.seeded.clients} לקוחות`,
      );
      router.push('/dashboard');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="נתוני דמו">
      {hasData ? (
        <p className="text-sm text-muted">
          החשבון כבר מכיל נתונים, ולכן טעינת דמו חסומה — כדי שלא ידרוס לך עבודה אמיתית.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted">
            טעינה של חשבון הדגמה מלא: 10 לקוחות, 30 משרות, 100 מועמדים, ראיונות, השמות, תשלומים ומשימות —
            עם קשרים אמיתיים ביניהם, כך שכל מסך מציג נתונים שאפשר לעבוד איתם.
          </p>
          <Button className="mt-3" loading={busy} onClick={seed} icon={<Icon.Sparkles size={16} />}>
            טעינת נתוני דמו
          </Button>
        </>
      )}
    </Card>
  );
}
