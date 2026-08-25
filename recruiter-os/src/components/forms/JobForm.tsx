'use client';

import React, { useEffect, useState } from 'react';
import { Button, Checkbox, ErrorNote, Field, Input, Select, Textarea } from '../ui';
import { Icon } from '../ui/icons';
import { TagEditor } from './CandidateForm';
import { api, errorMessage } from '@/lib/client/api';
import { useToast } from '../ui/Toast';
import {
  EMPLOYMENT_TYPES, JOB_PRIORITIES, JOB_STATUSES, REGIONS, REQUIREMENT_KINDS,
} from '@/lib/domain/constants';

export interface JobFormValues {
  title: string;
  client_id: string;
  headcount: string;
  city: string;
  region: string;
  salary_min: string;
  salary_max: string;
  salary_period: string;
  hours: string;
  work_days: string;
  employment_type: string;
  description: string;
  benefits: string;
  status: string;
  priority: string;
  deadline: string;
  fee_type: string;
  fee_value: string;
  requirements: Array<{ kind: string; value: string; is_required: boolean }>;
  tags: string[];
}

export const EMPTY_JOB: JobFormValues = {
  title: '', client_id: '', headcount: '1', city: '', region: '', salary_min: '', salary_max: '',
  salary_period: 'month', hours: '', work_days: '', employment_type: '', description: '', benefits: '',
  status: 'open', priority: 'normal', deadline: '', fee_type: 'percent', fee_value: '',
  requirements: [], tags: [],
};

export function JobForm({
  initial,
  jobId,
  onSaved,
  onCancel,
}: {
  initial?: Partial<JobFormValues>;
  jobId?: string;
  onSaved: (job: { id: string }) => void;
  onCancel?: () => void;
}) {
  const toast = useToast();
  const [values, setValues] = useState<JobFormValues>({ ...EMPTY_JOB, ...initial });
  const [clients, setClients] = useState<Array<{ value: string; label: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ clients: Array<{ id: string; name: string }> }>('/api/clients?limit=200')
      .then((result) => setClients(result.clients.map((client) => ({ value: client.id, label: client.name }))))
      .catch(() => setClients([]));
  }, []);

  function set<K extends keyof JobFormValues>(key: K, value: JobFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (values.title.trim().length < 2) {
      setError('יש להזין שם משרה');
      return;
    }
    setSaving(true);
    setError(null);
    const number = (value: string) => (value.trim() === '' ? null : Number(value));
    try {
      const payload = {
        title: values.title.trim(),
        client_id: values.client_id || null,
        headcount: Number(values.headcount || 1),
        city: values.city.trim() || null,
        region: values.region || null,
        salary_min: number(values.salary_min),
        salary_max: number(values.salary_max),
        salary_period: values.salary_period,
        hours: values.hours.trim() || null,
        work_days: values.work_days.trim() || null,
        employment_type: values.employment_type || null,
        description: values.description.trim() || null,
        benefits: values.benefits.trim() || null,
        status: values.status,
        priority: values.priority,
        deadline: values.deadline || null,
        fee_type: values.fee_type,
        fee_value: number(values.fee_value),
        requirements: values.requirements.filter((requirement) => requirement.value.trim()),
        tags: values.tags,
      };
      const result = jobId
        ? await api.patch<{ job: { id: string } }>(`/api/jobs/${jobId}`, payload)
        : await api.post<{ job: { id: string } }>('/api/jobs', payload);
      toast.success(jobId ? 'המשרה עודכנה' : 'המשרה נפתחה');
      onSaved(result.job);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorNote>{error}</ErrorNote>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="שם המשרה" required className="sm:col-span-2">
          <Input
            value={values.title}
            onChange={(event) => set('title', event.target.value)}
            placeholder="נהג חלוקה C"
            autoFocus
          />
        </Field>
        <Field label="לקוח">
          <Select
            options={clients}
            placeholder="ללא לקוח"
            value={values.client_id}
            onChange={(event) => set('client_id', event.target.value)}
          />
        </Field>
        <Field label="מספר עובדים דרוש">
          <Input
            type="number"
            min={1}
            value={values.headcount}
            onChange={(event) => set('headcount', event.target.value)}
          />
        </Field>
        <Field label="עיר">
          <Input value={values.city} onChange={(event) => set('city', event.target.value)} />
        </Field>
        <Field label="אזור">
          <Select
            options={REGIONS}
            placeholder="בחר אזור"
            value={values.region}
            onChange={(event) => set('region', event.target.value)}
          />
        </Field>
        <Field label="שכר מ־">
          <Input
            type="number"
            value={values.salary_min}
            onChange={(event) => set('salary_min', event.target.value)}
          />
        </Field>
        <Field label="שכר עד">
          <Input
            type="number"
            value={values.salary_max}
            onChange={(event) => set('salary_max', event.target.value)}
          />
        </Field>
        <Field label="בסיס שכר">
          <Select
            options={[
              { value: 'month', label: 'חודשי' },
              { value: 'hour', label: 'שעתי' },
              { value: 'year', label: 'שנתי' },
            ]}
            value={values.salary_period}
            onChange={(event) => set('salary_period', event.target.value)}
          />
        </Field>
        <Field label="סוג העסקה">
          <Select
            options={EMPLOYMENT_TYPES}
            placeholder="בחר"
            value={values.employment_type}
            onChange={(event) => set('employment_type', event.target.value)}
          />
        </Field>
        <Field label="שעות עבודה">
          <Input
            value={values.hours}
            onChange={(event) => set('hours', event.target.value)}
            placeholder="07:00–16:00"
          />
        </Field>
        <Field label="ימי עבודה">
          <Input
            value={values.work_days}
            onChange={(event) => set('work_days', event.target.value)}
            placeholder="א׳–ה׳"
          />
        </Field>
        <Field label="סטטוס">
          <Select
            options={JOB_STATUSES}
            value={values.status}
            onChange={(event) => set('status', event.target.value)}
          />
        </Field>
        <Field label="עדיפות">
          <Select
            options={JOB_PRIORITIES}
            value={values.priority}
            onChange={(event) => set('priority', event.target.value)}
          />
        </Field>
        <Field label="דדליין">
          <Input
            type="date"
            value={values.deadline}
            onChange={(event) => set('deadline', event.target.value)}
          />
        </Field>
        <Field label="סוג עמלה">
          <Select
            options={[
              { value: 'percent', label: 'אחוז משכר' },
              { value: 'fixed', label: 'סכום קבוע' },
            ]}
            value={values.fee_type}
            onChange={(event) => set('fee_type', event.target.value)}
          />
        </Field>
        <Field label={values.fee_type === 'percent' ? 'עמלה (%)' : 'עמלה (₪)'}>
          <Input
            type="number"
            value={values.fee_value}
            onChange={(event) => set('fee_value', event.target.value)}
            placeholder={values.fee_type === 'percent' ? '12' : '5000'}
          />
        </Field>
      </div>

      <RequirementEditor
        requirements={values.requirements}
        onChange={(requirements) => set('requirements', requirements)}
      />

      <TagEditor tags={values.tags} onChange={(tags) => set('tags', tags)} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="תיאור המשרה">
          <Textarea
            value={values.description}
            onChange={(event) => set('description', event.target.value)}
            rows={4}
          />
        </Field>
        <Field label="יתרונות ותנאים">
          <Textarea
            value={values.benefits}
            onChange={(event) => set('benefits', event.target.value)}
            rows={4}
          />
        </Field>
      </div>

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            ביטול
          </Button>
        )}
        <Button type="submit" loading={saving}>
          {jobId ? 'שמירת שינויים' : 'פתיחת משרה'}
        </Button>
      </div>
    </form>
  );
}

function RequirementEditor({
  requirements,
  onChange,
}: {
  requirements: JobFormValues['requirements'];
  onChange: (value: JobFormValues['requirements']) => void;
}) {
  return (
    <div>
      <span className="field-label">דרישות המשרה</span>
      <p className="mb-2 text-xs text-faint">
        דרישות מובנות הן מה שמנוע ההתאמה בודק מול המאגר. דרישת חובה שלא מתקיימת מורידה משמעותית את הציון.
      </p>
      <div className="space-y-2">
        {requirements.map((requirement, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <Select
              className="w-32"
              options={REQUIREMENT_KINDS}
              value={requirement.kind}
              onChange={(event) => {
                const next = [...requirements];
                next[index] = { ...requirement, kind: event.target.value };
                onChange(next);
              }}
            />
            <Input
              className="min-w-[10rem] flex-1"
              value={requirement.value}
              placeholder="רישיון C / מלגזה / 2 שנות ניסיון"
              onChange={(event) => {
                const next = [...requirements];
                next[index] = { ...requirement, value: event.target.value };
                onChange(next);
              }}
            />
            <Checkbox
              label="חובה"
              checked={requirement.is_required}
              onChange={(event) => {
                const next = [...requirements];
                next[index] = { ...requirement, is_required: event.target.checked };
                onChange(next);
              }}
            />
            <button
              type="button"
              onClick={() => onChange(requirements.filter((_, i) => i !== index))}
              className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger"
              aria-label="הסרה"
            >
              <Icon.Trash size={16} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...requirements, { kind: 'license', value: '', is_required: true }])}
        className="mt-2 flex items-center gap-1 text-sm font-medium text-brand"
      >
        <Icon.Plus size={14} /> הוספת דרישה
      </button>
    </div>
  );
}
