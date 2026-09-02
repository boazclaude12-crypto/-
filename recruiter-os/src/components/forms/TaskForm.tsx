'use client';

import React, { useEffect, useState } from 'react';
import { Button, ErrorNote, Field, Input, Select, Textarea } from '../ui';
import { api, errorMessage } from '@/lib/client/api';
import { useToast } from '../ui/Toast';
import { TASK_PRIORITIES } from '@/lib/domain/constants';

export interface TaskFormValues {
  title: string;
  details: string;
  due_at: string;
  remind_at: string;
  priority: string;
  candidate_id: string;
  client_id: string;
  job_id: string;
}

/** Local datetime string for <input type="datetime-local">. */
function defaultDue(): string {
  const date = new Date();
  date.setHours(date.getHours() + 2, 0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function TaskForm({
  initial,
  taskId,
  lockedContext,
  onSaved,
  onCancel,
}: {
  initial?: Partial<TaskFormValues>;
  taskId?: string;
  /** Pre-linked entity when opened from a candidate/job/client screen. */
  lockedContext?: { candidateId?: string; clientId?: string; jobId?: string; label?: string };
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const toast = useToast();
  const [values, setValues] = useState<TaskFormValues>({
    title: '',
    details: '',
    due_at: defaultDue(),
    remind_at: '',
    priority: 'normal',
    candidate_id: lockedContext?.candidateId ?? '',
    client_id: lockedContext?.clientId ?? '',
    job_id: lockedContext?.jobId ?? '',
    ...initial,
  });
  const [candidates, setCandidates] = useState<Array<{ value: string; label: string }>>([]);
  const [jobs, setJobs] = useState<Array<{ value: string; label: string }>>([]);
  const [clients, setClients] = useState<Array<{ value: string; label: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lockedContext) return;
    Promise.all([
      api.get<{ candidates: Array<{ id: string; first_name: string; last_name: string }> }>('/api/candidates?limit=100'),
      api.get<{ jobs: Array<{ id: string; title: string }> }>('/api/jobs?limit=100'),
      api.get<{ clients: Array<{ id: string; name: string }> }>('/api/clients?limit=100'),
    ])
      .then(([candidateResult, jobResult, clientResult]) => {
        setCandidates(
          candidateResult.candidates.map((candidate) => ({
            value: candidate.id,
            label: `${candidate.first_name} ${candidate.last_name}`.trim(),
          })),
        );
        setJobs(jobResult.jobs.map((job) => ({ value: job.id, label: job.title })));
        setClients(clientResult.clients.map((client) => ({ value: client.id, label: client.name })));
      })
      .catch(() => undefined);
  }, [lockedContext]);

  function set<K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (values.title.trim().length < 2) {
      setError('יש להזין כותרת למשימה');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: values.title.trim(),
        details: values.details.trim() || null,
        due_at: values.due_at ? new Date(values.due_at).toISOString() : null,
        remind_at: values.remind_at ? new Date(values.remind_at).toISOString() : null,
        priority: values.priority,
        candidate_id: values.candidate_id || null,
        client_id: values.client_id || null,
        job_id: values.job_id || null,
      };
      if (taskId) await api.patch(`/api/tasks/${taskId}`, payload);
      else await api.post('/api/tasks', payload);
      toast.success(taskId ? 'המשימה עודכנה' : 'המשימה נוספה');
      onSaved();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorNote>{error}</ErrorNote>

      <Field label="מה צריך לעשות" required>
        <Input
          value={values.title}
          onChange={(event) => set('title', event.target.value)}
          placeholder="להתקשר לדני בנוגע למשרת נהג"
          autoFocus
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="תאריך ושעה">
          <Input
            type="datetime-local"
            value={values.due_at}
            onChange={(event) => set('due_at', event.target.value)}
          />
        </Field>
        <Field label="תזכורת" hint="ריק = ללא תזכורת נפרדת">
          <Input
            type="datetime-local"
            value={values.remind_at}
            onChange={(event) => set('remind_at', event.target.value)}
          />
        </Field>
        <Field label="עדיפות">
          <Select
            options={TASK_PRIORITIES}
            value={values.priority}
            onChange={(event) => set('priority', event.target.value)}
          />
        </Field>
      </div>

      {lockedContext?.label ? (
        <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand">
          המשימה תקושר ל{lockedContext.label}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="מועמד">
            <Select
              options={candidates}
              placeholder="ללא"
              value={values.candidate_id}
              onChange={(event) => set('candidate_id', event.target.value)}
            />
          </Field>
          <Field label="משרה">
            <Select
              options={jobs}
              placeholder="ללא"
              value={values.job_id}
              onChange={(event) => set('job_id', event.target.value)}
            />
          </Field>
          <Field label="לקוח">
            <Select
              options={clients}
              placeholder="ללא"
              value={values.client_id}
              onChange={(event) => set('client_id', event.target.value)}
            />
          </Field>
        </div>
      )}

      <Field label="פרטים">
        <Textarea value={values.details} onChange={(event) => set('details', event.target.value)} rows={3} />
      </Field>

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            ביטול
          </Button>
        )}
        <Button type="submit" loading={saving}>
          {taskId ? 'שמירה' : 'הוספת משימה'}
        </Button>
      </div>
    </form>
  );
}
