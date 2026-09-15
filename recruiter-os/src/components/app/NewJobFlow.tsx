'use client';

import React, { useState } from 'react';
import { Badge, Button, Card, ErrorNote, Spinner, Tabs, Textarea } from '../ui';
import { Icon } from '../ui/icons';
import { JobForm, EMPTY_JOB, type JobFormValues } from '../forms/JobForm';
import { api, errorMessage } from '../../lib/client/api';
import { useToast } from '../ui/Toast';

interface ParsedJob {
  title: string | null;
  city: string | null;
  region: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: 'month' | 'hour' | 'year';
  employment_type: string | null;
  work_mode: 'onsite' | 'hybrid' | 'remote';
  hours: string | null;
  requirements: Array<{ kind: string; value: string; is_required: boolean }>;
  description: string;
  missing: string[];
  confidence: number;
}

function toFormValues(job: ParsedJob): Partial<JobFormValues> {
  return {
    ...EMPTY_JOB,
    title: job.title ?? '',
    city: job.city ?? '',
    region: job.region ?? '',
    salary_min: job.salary_min != null ? String(job.salary_min) : '',
    salary_max: job.salary_max != null ? String(job.salary_max) : '',
    salary_period: job.salary_period,
    employment_type: job.employment_type ?? '',
    work_mode: job.work_mode,
    hours: job.hours ?? '',
    description: job.description,
    requirements: job.requirements.map((requirement) => ({
      kind: requirement.kind,
      value: requirement.value,
      is_required: requirement.is_required,
    })),
  };
}

/**
 * Two ways to open a job: paste the message the client sent, or fill the form.
 *
 * Pasting is first because it is how openings arrive, and because the structured
 * requirements it produces are what the matching engine scores against — typed by hand,
 * one at a time, they simply never get entered.
 */
export function NewJobFlow({ onDone }: { onDone?: (job: { id: string }) => void } = {}) {
  const toast = useToast();
  const [tab, setTab] = useState<'paste' | 'manual'>('paste');
  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedJob | null>(null);
  const [prefill, setPrefill] = useState<Partial<JobFormValues> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function read() {
    setParsing(true);
    setError(null);
    try {
      const result = await api.post<{ job: ParsedJob }>('/api/jobs/parse', { text });
      setParsed(result.job);
      setPrefill(toFormValues(result.job));
      toast.success(
        result.job.requirements.length > 0
          ? `זוהו ${result.job.requirements.length} דרישות — בדוק ואשר`
          : 'המשרה נקראה — לא זוהו דרישות, כדאי להוסיף',
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setParsing(false);
    }
  }

  if (prefill && parsed) {
    const required = parsed.requirements.filter((r) => r.is_required);
    return (
      <div className="space-y-4">
        <Card title="מה הבנתי מהמשרה">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={parsed.confidence >= 75 ? 'emerald' : 'amber'}>
              {parsed.confidence}% מהשדות זוהו
            </Badge>
            {required.map((requirement) => (
              <Badge key={requirement.value} tone="sky">{requirement.value} · חובה</Badge>
            ))}
            {parsed.requirements.filter((r) => !r.is_required).map((requirement) => (
              <Badge key={requirement.value} tone="slate">{requirement.value} · יתרון</Badge>
            ))}
          </div>
          {parsed.missing.length > 0 && (
            <p className="mt-3 text-sm text-warn">
              לא הופיע בטקסט: {parsed.missing.join(', ')} — השלם למטה כדי שההתאמה תהיה מדויקת.
            </p>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => {
              setPrefill(null);
              setParsed(null);
            }}
          >
            הדבקה מחדש
          </Button>
        </Card>

        <JobForm
          initial={prefill}
          onSaved={(job) => onDone?.(job)}
          onCancel={() => {
            setPrefill(null);
            setParsed(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs
        tabs={[
          { key: 'paste', label: 'הדבקת משרה' },
          { key: 'manual', label: 'מילוי ידני' },
        ]}
        active={tab}
        onChange={(key) => setTab(key as 'paste' | 'manual')}
      />

      {tab === 'paste' ? (
        <Card>
          <p className="text-sm text-muted">
            הדבק את המשרה כמו שקיבלת אותה — מוואטסאפ, ממייל, מכל מקום. המערכת תוציא את
            השם, העיר, השכר והדרישות, ותפריד בין <strong className="text-ink">חובה</strong> ל
            <strong className="text-ink">יתרון</strong>.
          </p>
          <ErrorNote>{error}</ErrorNote>
          <Textarea
            className="mt-3"
            rows={10}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={'דרושים נהגי חלוקה C לחיפה\nשכר 55 ₪ לשעה, משמרות 07:00-16:00\n\nדרישות חובה:\n- רישיון C\n- ניסיון שנתיים\n\nיתרון:\n- רישיון מלגזה'}
            autoFocus
          />
          <div className="mt-3 flex items-center gap-2">
            <Button onClick={read} loading={parsing} disabled={text.trim().length < 10} icon={<Icon.Sparkles size={16} />}>
              קריאת המשרה
            </Button>
            {parsing && <Spinner className="h-4 w-4 text-faint" />}
          </div>
          <p className="mt-3 text-xs text-faint">
            הדרישות הן מה שההתאמה מחשבת עליו. משרה בלי דרישות תיתן ציונים דומים לכולם.
          </p>
        </Card>
      ) : (
        <JobForm onSaved={(job) => onDone?.(job)} />
      )}
    </div>
  );
}
