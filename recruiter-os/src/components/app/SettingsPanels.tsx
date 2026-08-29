'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, Checkbox, Field, Input, Select, cx } from '../ui';
import { ConfirmDialog } from '../ui/Modal';
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
  { value: 'cyan', label: 'טורקיז' },
  { value: 'indigo', label: 'כחול' },
  { value: 'violet', label: 'סגול' },
  { value: 'amber', label: 'כתום' },
  { value: 'emerald', label: 'ירוק' },
  { value: 'rose', label: 'אדום' },
];

/**
 * Stages are shared by candidate status and the kanban columns, so every edit here
 * affects both. Deleting is refused server-side while records still sit in the stage.
 */
export function StageEditor({ stages }: { stages: StageView[] }) {
  const router = useRouter();
  const toast = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<StageView | null>(null);
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

  async function save(stage: StageView, values: Record<string, unknown>) {
    setBusy(true);
    try {
      await api.patch(`/api/stages/${stage.id}`, values);
      toast.success('השלב עודכן');
      setEditingId(null);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.del(`/api/stages/${deleting.id}`);
      toast.success('השלב נמחק');
      setDeleting(null);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-1.5">
        {stages.map((stage, index) => (
          <li key={stage.id} className="rounded-lg border border-line px-3 py-2">
            {editingId === stage.id ? (
              <StageRowEditor
                stage={stage}
                busy={busy}
                onCancel={() => setEditingId(null)}
                onSave={(values) => save(stage, values)}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="num w-5 shrink-0 text-xs text-faint">{index + 1}</span>
                <Badge tone={stage.color}>{stage.label}</Badge>
                <code className="text-xs text-faint" dir="ltr">{stage.key}</code>
                {!stage.in_pipeline && <span className="text-xs text-faint">מחוץ לקנבן</span>}
                <span className="flex-1" />
                <button
                  onClick={() => setEditingId(stage.id)}
                  className="rounded-md p-1.5 text-muted transition hover:bg-line/50 hover:text-ink"
                  aria-label={`עריכת ${stage.label}`}
                >
                  <Icon.Edit size={15} />
                </button>
                <button
                  onClick={() => setDeleting(stage)}
                  className="rounded-md p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger"
                  aria-label={`מחיקת ${stage.label}`}
                >
                  <Icon.Trash size={15} />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="grid gap-2 rounded-lg border border-brand/40 bg-brand-soft/40 p-3 sm:grid-cols-4">
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

      <ConfirmDialog
        open={deleting !== null}
        title="מחיקת שלב"
        message={`למחוק את השלב "${deleting?.label}"? אם יש מועמדים או תהליכים בשלב הזה, המחיקה תיחסם.`}
        confirmLabel="מחיקה"
        busy={busy}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

function StageRowEditor({
  stage,
  busy,
  onSave,
  onCancel,
}: {
  stage: StageView;
  busy: boolean;
  onSave: (values: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(stage.label);
  const [color, setColor] = useState(stage.color);
  const [inPipeline, setInPipeline] = useState(stage.in_pipeline);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        className="h-9 max-w-[12rem] flex-1"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        aria-label="שם השלב"
      />
      <Select
        className="h-9 w-auto"
        options={COLORS}
        value={color}
        onChange={(event) => setColor(event.target.value)}
        aria-label="צבע"
      />
      <Checkbox
        label="בקנבן"
        checked={inPipeline}
        onChange={(event) => setInPipeline(event.target.checked)}
      />
      <span className="flex-1" />
      <Button
        size="sm"
        loading={busy}
        onClick={() => onSave({ label, color, in_pipeline: inPipeline })}
      >
        שמירה
      </Button>
      <Button size="sm" variant="secondary" onClick={onCancel}>ביטול</Button>
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
          <Button className={cx('mt-3')} loading={busy} onClick={seed} icon={<Icon.Sparkles size={16} />}>
            טעינת נתוני דמו
          </Button>
        </>
      )}
    </Card>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Says plainly whether this deployment keeps its data.
 *
 * A missing volume is invisible until the next deploy wipes everything, which is exactly
 * the moment it is too late to find out. So the state is reported here, in the words that
 * matter to the person using it, together with the one-line fix and a backup they can
 * take right now regardless.
 */
export function DataSafetyCard({
  health,
}: {
  health: {
    dataDir: string;
    persistent: boolean;
    containerised: boolean;
    databaseBytes: number;
    uploadBytes: number;
    uploadCount: number;
  };
}) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  // Outside a container the data sits on an ordinary disk and nothing is at risk.
  const atRisk = health.containerised && !health.persistent;

  async function download() {
    setBusy(true);
    try {
      const response = await fetch('/api/export', { credentials: 'same-origin' });
      if (!response.ok) throw new Error('הייצוא נכשל');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `recruiter-os-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('הגיבוי ירד למחשב');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="הנתונים שלי">
      <div
        className={cx(
          'flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-sm',
          atRisk ? 'bg-danger/10 text-danger' : 'bg-ok/10 text-ok',
        )}
      >
        {atRisk ? <Icon.Alert size={16} className="mt-0.5 shrink-0" /> : <Icon.Check size={16} className="mt-0.5 shrink-0" />}
        <div>
          <p className="font-medium">
            {atRisk ? 'הנתונים יימחקו בעדכון הבא' : 'הנתונים נשמרים'}
          </p>
          <p className="mt-0.5 opacity-90">
            {atRisk
              ? 'התיקייה שבה יושבים המסד וקורות החיים אינה דיסק קבוע. חבר Volume בשרת בנתיב שלמטה — פעולה חד-פעמית.'
              : health.containerised
                ? 'התיקייה מחוברת לדיסק קבוע ושורדת פריסות מחדש.'
                : 'המערכת רצה מקומית, על דיסק רגיל.'}
          </p>
        </div>
      </div>

      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-faint">תיקיית הנתונים</dt>
          <dd className="text-ink" dir="ltr">{health.dataDir}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-faint">גודל המסד</dt>
          <dd className="num text-ink">{formatBytes(health.databaseBytes)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-faint">קבצי קורות חיים</dt>
          <dd className="num text-ink">
            {health.uploadCount} קבצים · {formatBytes(health.uploadBytes)}
          </dd>
        </div>
      </dl>

      <Button
        variant="secondary"
        className="mt-3"
        loading={busy}
        onClick={download}
        icon={<Icon.Doc size={16} />}
      >
        הורדת גיבוי מלא
      </Button>
      <p className="mt-2 text-xs text-faint">
        קובץ JSON אחד עם כל המועמדים, המשרות, הלקוחות והתהליכים. הקבצים המצורפים עצמם לא
        כלולים — רק הטקסט שחולץ מהם.
      </p>
    </Card>
  );
}
