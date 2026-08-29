'use client';

import React, { useState } from 'react';
import { Button, Checkbox, ErrorNote, Field, Input, Select, Textarea, cx } from '../ui';
import { Icon } from '../ui/icons';
import { api, errorMessage } from '@/lib/client/api';
import { useToast } from '../ui/Toast';
import {
  ATTRIBUTE_KINDS, AVAILABILITY, CANDIDATE_SOURCES, EMPLOYMENT_TYPES, REGIONS,
} from '@/lib/domain/constants';

export interface CandidateFormValues {
  first_name: string;
  last_name: string;
  phone: string;
  whatsapp: string;
  email: string;
  city: string;
  region: string;
  max_commute_km: string;
  has_car: boolean;
  willing_to_relocate: boolean;
  current_role: string;
  years_experience: string;
  education: string;
  current_salary: string;
  desired_salary: string;
  availability: string;
  employment_type: string;
  source: string;
  notes: string;
  attributes: Array<{ kind: string; value: string }>;
  experiences: Array<{
    company: string; title: string; start_date: string; end_date: string; is_current: boolean; description: string;
  }>;
  tags: string[];
}

export const EMPTY_CANDIDATE: CandidateFormValues = {
  first_name: '', last_name: '', phone: '', whatsapp: '', email: '', city: '', region: '',
  max_commute_km: '', has_car: false, willing_to_relocate: false,
  current_role: '', years_experience: '', education: '', current_salary: '', desired_salary: '',
  availability: '', employment_type: '', source: '', notes: '',
  attributes: [], experiences: [], tags: [],
};

function toPayload(values: CandidateFormValues) {
  const number = (value: string) => (value.trim() === '' ? null : Number(value));
  return {
    first_name: values.first_name.trim(),
    last_name: values.last_name.trim() || null,
    phone: values.phone.trim() || null,
    whatsapp: values.whatsapp.trim() || null,
    email: values.email.trim() || null,
    city: values.city.trim() || null,
    region: values.region || null,
    max_commute_km: number(values.max_commute_km),
    has_car: values.has_car ? 1 : 0,
    willing_to_relocate: values.willing_to_relocate ? 1 : 0,
    current_role: values.current_role.trim() || null,
    years_experience: number(values.years_experience),
    education: values.education.trim() || null,
    current_salary: number(values.current_salary),
    desired_salary: number(values.desired_salary),
    availability: values.availability || null,
    employment_type: values.employment_type || null,
    source: values.source || null,
    notes: values.notes.trim() || null,
    attributes: values.attributes.filter((a) => a.value.trim()),
    experiences: values.experiences
      .filter((e) => e.title.trim())
      .map((e) => ({
        company: e.company.trim() || '—',
        title: e.title.trim(),
        start_date: e.start_date.trim() || null,
        end_date: e.end_date.trim() || null,
        is_current: e.is_current,
        description: e.description.trim() || null,
      })),
    tags: values.tags.filter(Boolean),
  };
}

export function CandidateForm({
  initial,
  candidateId,
  onSaved,
  onCancel,
}: {
  initial?: Partial<CandidateFormValues>;
  candidateId?: string;
  onSaved: (candidate: { id: string }) => void;
  onCancel?: () => void;
}) {
  const toast = useToast();
  const [values, setValues] = useState<CandidateFormValues>({ ...EMPTY_CANDIDATE, ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(Boolean(candidateId));

  function set<K extends keyof CandidateFormValues>(key: K, value: CandidateFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!values.first_name.trim()) {
      setError('יש להזין שם פרטי');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = toPayload(values);
      const result = candidateId
        ? await api.patch<{ candidate: { id: string } }>(`/api/candidates/${candidateId}`, payload)
        : await api.post<{ candidate: { id: string } }>('/api/candidates', payload);
      toast.success(candidateId ? 'המועמד עודכן' : 'המועמד נוסף למאגר');
      onSaved(result.candidate);
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
        <Field label="שם פרטי" required>
          <Input value={values.first_name} onChange={(e) => set('first_name', e.target.value)} autoFocus />
        </Field>
        <Field label="שם משפחה">
          <Input value={values.last_name} onChange={(e) => set('last_name', e.target.value)} />
        </Field>
        <Field label="טלפון">
          <Input
            value={values.phone}
            onChange={(e) => set('phone', e.target.value)}
            inputMode="tel"
            placeholder="050-1234567"
          />
        </Field>
        <Field label="אימייל">
          <Input value={values.email} onChange={(e) => set('email', e.target.value)} inputMode="email" />
        </Field>
        <Field label="עיר">
          <Input value={values.city} onChange={(e) => set('city', e.target.value)} placeholder="חיפה" />
        </Field>
        <Field label="תפקיד נוכחי">
          <Input value={values.current_role} onChange={(e) => set('current_role', e.target.value)} />
        </Field>
      </div>

      <div className="rounded-xl border border-line bg-canvas/50 p-3">
        <p className="mb-2.5 flex items-center gap-1.5 text-sm font-medium text-ink">
          <Icon.MapPin size={14} className="text-faint" />
          נסיעה לעבודה
          <span className="font-normal text-faint">— משפיע ישירות על ציון ההתאמה</span>
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label='עד כמה ק"מ מוכן לנסוע' hint="ריק = לפי רכב">
            <Input
              type="number"
              min={0}
              max={400}
              value={values.max_commute_km}
              onChange={(e) => set('max_commute_km', e.target.value)}
              placeholder={values.has_car ? '40' : '20'}
            />
          </Field>
          <div className="flex items-end pb-2">
            <Checkbox
              label="יש רכב"
              checked={values.has_car}
              onChange={(e) => set('has_car', e.target.checked)}
            />
          </div>
          <div className="flex items-end pb-2">
            <Checkbox
              label="מוכן לעבור דירה"
              checked={values.willing_to_relocate}
              onChange={(e) => set('willing_to_relocate', e.target.checked)}
            />
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowMore((value) => !value)}
        className="flex items-center gap-1.5 text-sm font-medium text-brand"
      >
        <Icon.Plus size={14} className={cx('transition', showMore && 'rotate-45')} />
        {showMore ? 'פחות פרטים' : 'פרטים נוספים (ניסיון, שכר, רישיונות)'}
      </button>

      {showMore && (
        <div className="space-y-4 border-t border-line pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="WhatsApp">
              <Input value={values.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} inputMode="tel" />
            </Field>
            <Field label="אזור">
              <Select
                options={REGIONS}
                placeholder="בחר אזור"
                value={values.region}
                onChange={(e) => set('region', e.target.value)}
              />
            </Field>
            <Field label="שנות ניסיון">
              <Input
                type="number"
                min={0}
                max={60}
                value={values.years_experience}
                onChange={(e) => set('years_experience', e.target.value)}
              />
            </Field>
            <Field label="שכר נוכחי (₪)">
              <Input
                type="number"
                value={values.current_salary}
                onChange={(e) => set('current_salary', e.target.value)}
              />
            </Field>
            <Field label="שכר רצוי (₪)">
              <Input
                type="number"
                value={values.desired_salary}
                onChange={(e) => set('desired_salary', e.target.value)}
              />
            </Field>
            <Field label="זמינות">
              <Select
                options={AVAILABILITY}
                placeholder="בחר זמינות"
                value={values.availability}
                onChange={(e) => set('availability', e.target.value)}
              />
            </Field>
            <Field label="סוג העסקה">
              <Select
                options={EMPLOYMENT_TYPES}
                placeholder="בחר"
                value={values.employment_type}
                onChange={(e) => set('employment_type', e.target.value)}
              />
            </Field>
            <Field label="מקור הגעה">
              <Select
                options={CANDIDATE_SOURCES}
                placeholder="בחר מקור"
                value={values.source}
                onChange={(e) => set('source', e.target.value)}
              />
            </Field>
            <Field label="השכלה">
              <Input value={values.education} onChange={(e) => set('education', e.target.value)} />
            </Field>
          </div>

          <AttributeEditor
            attributes={values.attributes}
            onChange={(attributes) => set('attributes', attributes)}
          />

          <ExperienceEditor
            experiences={values.experiences}
            onChange={(experiences) => set('experiences', experiences)}
          />

          <TagEditor tags={values.tags} onChange={(tags) => set('tags', tags)} />

          <Field label="הערות">
            <Textarea value={values.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
          </Field>
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            ביטול
          </Button>
        )}
        <Button type="submit" loading={saving}>
          {candidateId ? 'שמירת שינויים' : 'הוספת מועמד'}
        </Button>
      </div>
    </form>
  );
}

export function AttributeEditor({
  attributes,
  onChange,
}: {
  attributes: Array<{ kind: string; value: string }>;
  onChange: (value: Array<{ kind: string; value: string }>) => void;
}) {
  return (
    <div>
      <span className="field-label">רישיונות, הסמכות וכישורים</span>
      <div className="space-y-2">
        {attributes.map((attribute, index) => (
          <div key={index} className="flex gap-2">
            <Select
              className="w-36"
              options={ATTRIBUTE_KINDS}
              value={attribute.kind}
              onChange={(event) => {
                const next = [...attributes];
                next[index] = { ...attribute, kind: event.target.value };
                onChange(next);
              }}
            />
            <Input
              value={attribute.value}
              placeholder="לדוגמה: רישיון C"
              onChange={(event) => {
                const next = [...attributes];
                next[index] = { ...attribute, value: event.target.value };
                onChange(next);
              }}
            />
            <button
              type="button"
              onClick={() => onChange(attributes.filter((_, i) => i !== index))}
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
        onClick={() => onChange([...attributes, { kind: 'license', value: '' }])}
        className="mt-2 flex items-center gap-1 text-sm font-medium text-brand"
      >
        <Icon.Plus size={14} /> הוספת שורה
      </button>
    </div>
  );
}

export function ExperienceEditor({
  experiences,
  onChange,
}: {
  experiences: CandidateFormValues['experiences'];
  onChange: (value: CandidateFormValues['experiences']) => void;
}) {
  return (
    <div>
      <span className="field-label">ניסיון תעסוקתי</span>
      <div className="space-y-3">
        {experiences.map((experience, index) => (
          <div key={index} className="rounded-lg border border-line p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                placeholder="תפקיד"
                value={experience.title}
                onChange={(event) => {
                  const next = [...experiences];
                  next[index] = { ...experience, title: event.target.value };
                  onChange(next);
                }}
              />
              <Input
                placeholder="חברה"
                value={experience.company}
                onChange={(event) => {
                  const next = [...experiences];
                  next[index] = { ...experience, company: event.target.value };
                  onChange(next);
                }}
              />
              <Input
                placeholder="משנת"
                value={experience.start_date}
                onChange={(event) => {
                  const next = [...experiences];
                  next[index] = { ...experience, start_date: event.target.value };
                  onChange(next);
                }}
              />
              <Input
                placeholder="עד שנת"
                value={experience.end_date}
                disabled={experience.is_current}
                onChange={(event) => {
                  const next = [...experiences];
                  next[index] = { ...experience, end_date: event.target.value };
                  onChange(next);
                }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Checkbox
                label="עובד שם כיום"
                checked={experience.is_current}
                onChange={(event) => {
                  const next = [...experiences];
                  next[index] = { ...experience, is_current: event.target.checked };
                  onChange(next);
                }}
              />
              <button
                type="button"
                onClick={() => onChange(experiences.filter((_, i) => i !== index))}
                className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                aria-label="הסרה"
              >
                <Icon.Trash size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() =>
          onChange([
            ...experiences,
            { company: '', title: '', start_date: '', end_date: '', is_current: false, description: '' },
          ])
        }
        className="mt-2 flex items-center gap-1 text-sm font-medium text-brand"
      >
        <Icon.Plus size={14} /> הוספת מקום עבודה
      </button>
    </div>
  );
}

export function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState('');

  function add() {
    const value = draft.trim().replace(/^#/, '');
    if (!value || tags.includes(value)) {
      setDraft('');
      return;
    }
    onChange([...tags, value]);
    setDraft('');
  }

  return (
    <div>
      <span className="field-label">תגיות</span>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-md bg-brand-soft px-2 py-1 text-xs font-medium text-brand"
          >
            #{tag}
            <button type="button" onClick={() => onChange(tags.filter((item) => item !== tag))} aria-label="הסרה">
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              add();
            }
          }}
          placeholder="נהג_C, זמין_מיידית…"
        />
        <Button type="button" variant="secondary" onClick={add}>
          הוספה
        </Button>
      </div>
    </div>
  );
}
