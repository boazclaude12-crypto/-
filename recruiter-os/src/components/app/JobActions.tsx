'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Select, Textarea } from '../ui';
import { Modal, ConfirmDialog } from '../ui/Modal';
import { Icon } from '../ui/icons';
import { useToast } from '../ui/Toast';
import { JobForm, type JobFormValues } from '../forms/JobForm';
import { TaskForm } from '../forms/TaskForm';
import { api, errorMessage } from '@/lib/client/api';
import { JOB_STATUSES } from '@/lib/domain/constants';

type DialogKind = 'edit' | 'placement' | 'task' | 'delete' | null;

export function JobActions({
  jobId,
  jobTitle,
  status,
  formValues,
  candidates,
}: {
  jobId: string;
  jobTitle: string;
  status: string;
  formValues: Partial<JobFormValues>;
  /** Candidates already in this job's pipeline — the pool a placement can come from. */
  candidates: Array<{ id: string; name: string; application_id: string }>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [currentStatus, setCurrentStatus] = useState(status);

  async function changeStatus(next: string) {
    setCurrentStatus(next);
    try {
      await api.patch(`/api/jobs/${jobId}`, { status: next });
      toast.success('סטטוס המשרה עודכן');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      setCurrentStatus(status);
    }
  }

  async function remove() {
    try {
      await api.del(`/api/jobs/${jobId}`);
      toast.success('המשרה נמחקה');
      router.push('/jobs');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="w-auto min-w-[8.5rem]"
          options={JOB_STATUSES}
          value={currentStatus}
          onChange={(event) => changeStatus(event.target.value)}
          aria-label="סטטוס משרה"
        />
        <Button variant="secondary" icon={<Icon.Target size={16} />} onClick={() => router.push(`/jobs/${jobId}/matches`)}>
          מועמדים מתאימים
        </Button>
        <Button variant="secondary" icon={<Icon.Money size={16} />} onClick={() => setDialog('placement')}>
          רישום השמה
        </Button>
        <Button variant="secondary" icon={<Icon.CheckSquare size={16} />} onClick={() => setDialog('task')}>
          משימה
        </Button>
        <Button variant="secondary" icon={<Icon.Edit size={16} />} onClick={() => setDialog('edit')}>
          עריכה
        </Button>
        <Button variant="ghost" icon={<Icon.Trash size={16} />} onClick={() => setDialog('delete')}>
          מחיקה
        </Button>
      </div>

      <Modal open={dialog === 'edit'} onClose={() => setDialog(null)} title="עריכת משרה" size="lg">
        <JobForm
          jobId={jobId}
          initial={formValues}
          onSaved={() => {
            setDialog(null);
            router.refresh();
          }}
          onCancel={() => setDialog(null)}
        />
      </Modal>

      <PlacementDialog
        open={dialog === 'placement'}
        jobId={jobId}
        candidates={candidates}
        onClose={() => setDialog(null)}
        onCreated={() => {
          setDialog(null);
          router.refresh();
        }}
      />

      <Modal open={dialog === 'task'} onClose={() => setDialog(null)} title="משימה חדשה">
        <TaskForm
          lockedContext={{ jobId, label: `משרת ${jobTitle}` }}
          onSaved={() => {
            setDialog(null);
            router.refresh();
          }}
          onCancel={() => setDialog(null)}
        />
      </Modal>

      <ConfirmDialog
        open={dialog === 'delete'}
        title="מחיקת משרה"
        message={`למחוק את "${jobTitle}"? כל השיוכים והראיונות המקושרים יימחקו גם הם.`}
        confirmLabel="מחיקה"
        onConfirm={remove}
        onClose={() => setDialog(null)}
      />
    </>
  );
}

/** Records the placement, the commission and the expected payment in one step. */
export function PlacementDialog({
  open,
  jobId,
  candidates,
  onClose,
  onCreated,
}: {
  open: boolean;
  jobId: string;
  candidates: Array<{ id: string; name: string; application_id: string }>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [values, setValues] = useState({
    candidate_id: '',
    start_date: new Date().toISOString().slice(0, 10),
    salary: '',
    fee_value: '',
    guarantee_days: '90',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && candidates.length === 1) {
      setValues((current) => ({ ...current, candidate_id: candidates[0]!.id }));
    }
  }, [open, candidates]);

  async function submit() {
    if (!values.candidate_id) {
      toast.error('יש לבחור מועמד');
      return;
    }
    setSaving(true);
    try {
      const application = candidates.find((candidate) => candidate.id === values.candidate_id);
      await api.post('/api/placements', {
        candidate_id: values.candidate_id,
        job_id: jobId,
        application_id: application?.application_id ?? null,
        start_date: values.start_date,
        salary: values.salary ? Number(values.salary) : null,
        fee_value: values.fee_value ? Number(values.fee_value) : null,
        guarantee_days: Number(values.guarantee_days || 90),
        notes: values.notes || null,
        create_payment: true,
      });
      toast.success('ההשמה נרשמה ונוצר תשלום צפוי');
      onCreated();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="רישום השמה"
      description="העמלה מחושבת אוטומטית לפי ההגדרות של המשרה או הלקוח, ואפשר לעקוף אותה כאן."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
          <Button onClick={submit} loading={saving}>רישום השמה</Button>
        </>
      }
    >
      {candidates.length === 0 ? (
        <p className="text-sm text-muted">
          אין מועמדים בפייפליין של המשרה. יש לשייך מועמד למשרה לפני רישום השמה.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="מועמד" required className="sm:col-span-2">
            <Select
              options={candidates.map((candidate) => ({ value: candidate.id, label: candidate.name }))}
              placeholder="בחר מועמד"
              value={values.candidate_id}
              onChange={(event) => setValues({ ...values, candidate_id: event.target.value })}
            />
          </Field>
          <Field label="תאריך התחלה" required>
            <Input
              type="date"
              value={values.start_date}
              onChange={(event) => setValues({ ...values, start_date: event.target.value })}
            />
          </Field>
          <Field label="שכר מוסכם (₪)" hint="משמש לחישוב העמלה באחוזים">
            <Input
              type="number"
              value={values.salary}
              onChange={(event) => setValues({ ...values, salary: event.target.value })}
            />
          </Field>
          <Field label="עמלה" hint="ריק = לפי הגדרת המשרה">
            <Input
              type="number"
              value={values.fee_value}
              onChange={(event) => setValues({ ...values, fee_value: event.target.value })}
            />
          </Field>
          <Field label="תקופת אחריות (ימים)">
            <Input
              type="number"
              value={values.guarantee_days}
              onChange={(event) => setValues({ ...values, guarantee_days: event.target.value })}
            />
          </Field>
          <Field label="הערות" className="sm:col-span-2">
            <Textarea
              value={values.notes}
              onChange={(event) => setValues({ ...values, notes: event.target.value })}
              rows={2}
            />
          </Field>
        </div>
      )}
    </Modal>
  );
}
