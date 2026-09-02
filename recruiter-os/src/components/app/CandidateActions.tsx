'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Field, Input, Select, Spinner, Textarea, cx } from '../ui';
import { Modal, ConfirmDialog } from '../ui/Modal';
import { Icon } from '../ui/icons';
import { useToast } from '../ui/Toast';
import { CandidateForm, type CandidateFormValues } from '../forms/CandidateForm';
import { TaskForm } from '../forms/TaskForm';
import { api, errorMessage } from '@/lib/client/api';
import { whatsappHref } from '@/lib/format';
import { INTERVIEW_KINDS, MESSAGE_CHANNELS } from '@/lib/domain/constants';

export interface CandidateSummary {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  status_key: string;
}

type DialogKind = 'edit' | 'message' | 'job' | 'interview' | 'note' | 'task' | 'delete' | null;

/** The action bar on the candidate profile — every button performs a real write. */
export function CandidateActions({
  candidate,
  stages,
  formValues,
}: {
  candidate: CandidateSummary;
  stages: Array<{ key: string; label: string }>;
  formValues: Partial<CandidateFormValues>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [status, setStatus] = useState(candidate.status_key);
  const [savingStatus, setSavingStatus] = useState(false);

  async function changeStatus(next: string) {
    setStatus(next);
    setSavingStatus(true);
    try {
      await api.patch(`/api/candidates/${candidate.id}`, { status_key: next });
      toast.success('הסטטוס עודכן');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      setStatus(candidate.status_key);
    } finally {
      setSavingStatus(false);
    }
  }

  async function remove() {
    try {
      await api.del(`/api/candidates/${candidate.id}`);
      toast.success('המועמד נמחק');
      router.push('/candidates');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const waHref = whatsappHref(candidate.whatsapp ?? candidate.phone);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="w-auto min-w-[9rem]"
          options={stages.map((stage) => ({ value: stage.key, label: stage.label }))}
          value={status}
          onChange={(event) => changeStatus(event.target.value)}
          disabled={savingStatus}
          aria-label="סטטוס מועמד"
        />
        {candidate.phone && (
          <a
            href={`tel:${candidate.phone}`}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium text-ink transition hover:bg-bg"
          >
            <Icon.Phone size={16} /> חיוג
          </a>
        )}
        {waHref && (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium text-ink transition hover:bg-bg"
          >
            <Icon.Chat size={16} /> WhatsApp
          </a>
        )}
        <Button variant="secondary" icon={<Icon.Mail size={16} />} onClick={() => setDialog('message')}>
          הודעה
        </Button>
        <Button variant="secondary" icon={<Icon.Briefcase size={16} />} onClick={() => setDialog('job')}>
          שיוך למשרה
        </Button>
        <Button variant="secondary" icon={<Icon.Calendar size={16} />} onClick={() => setDialog('interview')}>
          ראיון
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

      <Modal
        open={dialog === 'edit'}
        onClose={() => setDialog(null)}
        title="עריכת מועמד"
        size="lg"
      >
        <CandidateForm
          candidateId={candidate.id}
          initial={formValues}
          onSaved={() => {
            setDialog(null);
            router.refresh();
          }}
          onCancel={() => setDialog(null)}
        />
      </Modal>

      <MessageDialog
        open={dialog === 'message'}
        candidate={candidate}
        onClose={() => setDialog(null)}
        onSent={() => {
          setDialog(null);
          router.refresh();
        }}
      />

      <AddToJobDialog
        open={dialog === 'job'}
        candidateId={candidate.id}
        onClose={() => setDialog(null)}
        onAdded={() => {
          setDialog(null);
          router.refresh();
        }}
      />

      <InterviewDialog
        open={dialog === 'interview'}
        candidateId={candidate.id}
        onClose={() => setDialog(null)}
        onScheduled={() => {
          setDialog(null);
          router.refresh();
        }}
      />

      <Modal open={dialog === 'task'} onClose={() => setDialog(null)} title="משימה חדשה">
        <TaskForm
          lockedContext={{ candidateId: candidate.id, label: candidate.name }}
          onSaved={() => {
            setDialog(null);
            router.refresh();
          }}
          onCancel={() => setDialog(null)}
        />
      </Modal>

      <ConfirmDialog
        open={dialog === 'delete'}
        title="מחיקת מועמד"
        message={`למחוק את ${candidate.name}? הפעולה תמחק גם את השיוכים, ההודעות והמסמכים שלו ואינה הפיכה.`}
        confirmLabel="מחיקה"
        onConfirm={remove}
        onClose={() => setDialog(null)}
      />
    </>
  );
}

/* --------------------------- Message composer --------------------------- */

const TONES = [
  { value: 'professional', label: 'מקצועי' },
  { value: 'short', label: 'קצר' },
  { value: 'friendly', label: 'חברי' },
  { value: 'urgent', label: 'דחוף' },
  { value: 'followup', label: 'מעקב' },
];

export function MessageDialog({
  open,
  candidate,
  jobId,
  onClose,
  onSent,
}: {
  open: boolean;
  candidate: CandidateSummary;
  jobId?: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const toast = useToast();
  const [channel, setChannel] = useState('whatsapp');
  const [tone, setTone] = useState('professional');
  const [selectedJob, setSelectedJob] = useState(jobId ?? '');
  const [jobs, setJobs] = useState<Array<{ value: string; label: string }>>([]);
  const [body, setBody] = useState('');
  const [subject, setSubject] = useState('');
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api
      .get<{ jobs: Array<{ id: string; title: string }> }>('/api/jobs?activeOnly=true&limit=100')
      .then((result) => setJobs(result.jobs.map((job) => ({ value: job.id, label: job.title }))))
      .catch(() => setJobs([]));
  }, [open]);

  async function generate() {
    setGenerating(true);
    setNotice(null);
    try {
      const result = await api.post<{ subject: string | null; body: string; provider: string }>(
        '/api/messages/generate',
        {
          candidate_id: candidate.id,
          job_id: selectedJob || null,
          tone,
          channel: channel === 'call' || channel === 'note' ? 'whatsapp' : channel,
        },
      );
      setBody(result.body);
      if (result.subject) setSubject(result.subject);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setGenerating(false);
    }
  }

  async function save(send: boolean) {
    if (!body.trim()) {
      toast.error('אין תוכן להודעה');
      return;
    }
    setSending(true);
    setNotice(null);
    try {
      const result = await api.post<{ delivery: { delivered: boolean; reason?: string } }>('/api/messages', {
        channel,
        candidate_id: candidate.id,
        job_id: selectedJob || null,
        subject: subject || null,
        body,
        send,
      });
      if (send && !result.delivery.delivered) {
        setNotice(result.delivery.reason ?? 'ההודעה נשמרה אך לא נשלחה.');
        toast.info('ההודעה נשמרה בהיסטוריה');
      } else {
        toast.success(send ? 'ההודעה נשלחה' : 'ההודעה נשמרה כטיוטה');
        onSent();
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSending(false);
    }
  }

  const waHref = whatsappHref(candidate.whatsapp ?? candidate.phone, body);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`הודעה ל${candidate.name}`}
      description="ניתן לייצר טיוטה אוטומטית, לערוך אותה, ולשמור בהיסטוריה."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => save(false)} loading={sending}>
            שמירה כטיוטה
          </Button>
          {waHref && channel === 'whatsapp' && (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => void save(false)}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-ok px-4 text-sm font-medium text-white transition hover:brightness-110"
            >
              <Icon.Chat size={16} /> פתיחה בוואטסאפ
            </a>
          )}
          <Button onClick={() => save(true)} loading={sending}>
            שליחה
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="ערוץ">
            <Select
              options={MESSAGE_CHANNELS}
              value={channel}
              onChange={(event) => setChannel(event.target.value)}
            />
          </Field>
          <Field label="סגנון">
            <Select options={TONES} value={tone} onChange={(event) => setTone(event.target.value)} />
          </Field>
          <Field label="משרה">
            <Select
              options={jobs}
              placeholder="ללא משרה"
              value={selectedJob}
              onChange={(event) => setSelectedJob(event.target.value)}
            />
          </Field>
        </div>

        <Button variant="subtle" onClick={generate} loading={generating} icon={<Icon.Sparkles size={16} />}>
          יצירת טיוטה
        </Button>

        {channel === 'email' && (
          <Field label="נושא">
            <Input value={subject} onChange={(event) => setSubject(event.target.value)} />
          </Field>
        )}

        <Field label="תוכן ההודעה">
          <Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={9} />
        </Field>

        {notice && (
          <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">
            {notice}
          </p>
        )}
      </div>
    </Modal>
  );
}

/* ----------------------------- Add to job ------------------------------- */

interface JobMatchOption {
  job: { id: string; title: string; client_name: string | null; city: string | null };
  score: number;
  reasons: string[];
  gaps: string[];
  alreadyApplied: boolean;
}

export function AddToJobDialog({
  open,
  candidateId,
  onClose,
  onAdded,
}: {
  open: boolean;
  candidateId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const toast = useToast();
  const [matches, setMatches] = useState<JobMatchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api
      .get<{ matches: JobMatchOption[] }>(`/api/candidates/${candidateId}/matches?limit=15`)
      .then((result) => setMatches(result.matches))
      .catch(() => setMatches([]))
      .finally(() => setLoading(false));
  }, [open, candidateId]);

  async function add(jobId: string, score: number) {
    setBusyId(jobId);
    try {
      await api.post('/api/applications', { candidate_id: candidateId, job_id: jobId, match_score: score });
      toast.success('המועמד שויך למשרה');
      onAdded();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="שיוך למשרה" description="המשרות מדורגות לפי התאמה למועמד." size="lg">
      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner className="h-6 w-6 text-brand" />
        </div>
      ) : matches.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">אין משרות פתוחות מתאימות כרגע.</p>
      ) : (
        <ul className="space-y-2">
          {matches.map((match) => (
            <li
              key={match.job.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2.5"
            >
              <span
                className={cx(
                  'num flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-sm font-semibold',
                  match.score >= 85
                    ? 'bg-ok/12 text-ok'
                    : match.score >= 65
                      ? 'bg-info/12 text-info'
                      : 'bg-line/60 text-muted',
                )}
              >
                {match.score}%
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{match.job.title}</span>
                <span className="block truncate text-xs text-muted">
                  {[match.job.client_name, match.job.city].filter(Boolean).join(' · ')}
                </span>
                {match.reasons[0] && (
                  <span className="block truncate text-xs text-faint">{match.reasons[0]}</span>
                )}
              </span>
              {match.alreadyApplied ? (
                <Badge tone="slate">כבר משויך</Badge>
              ) : (
                <Button size="sm" loading={busyId === match.job.id} onClick={() => add(match.job.id, match.score)}>
                  שיוך
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/* --------------------------- Schedule interview -------------------------- */

export function InterviewDialog({
  open,
  candidateId,
  jobId,
  applicationId,
  onClose,
  onScheduled,
}: {
  open: boolean;
  candidateId: string;
  jobId?: string;
  applicationId?: string;
  onClose: () => void;
  onScheduled: () => void;
}) {
  const toast = useToast();
  const [jobs, setJobs] = useState<Array<{ value: string; label: string }>>([]);
  const [values, setValues] = useState({
    job_id: jobId ?? '',
    kind: 'recruiter',
    scheduled_at: '',
    duration_minutes: '45',
    location: '',
    interviewer: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(10, 0, 0, 0);
    const pad = (value: number) => String(value).padStart(2, '0');
    setValues((current) => ({
      ...current,
      scheduled_at: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T10:00`,
    }));
    api
      .get<{ jobs: Array<{ id: string; title: string }> }>('/api/jobs?activeOnly=true&limit=100')
      .then((result) => setJobs(result.jobs.map((job) => ({ value: job.id, label: job.title }))))
      .catch(() => setJobs([]));
  }, [open]);

  async function submit() {
    if (!values.scheduled_at) {
      toast.error('יש לבחור מועד');
      return;
    }
    setSaving(true);
    try {
      await api.post('/api/interviews', {
        candidate_id: candidateId,
        job_id: values.job_id || null,
        application_id: applicationId ?? null,
        kind: values.kind,
        scheduled_at: new Date(values.scheduled_at).toISOString(),
        duration_minutes: Number(values.duration_minutes),
        location: values.location || null,
        interviewer: values.interviewer || null,
      });
      toast.success('הראיון נקבע');
      onScheduled();
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
      title="קביעת ראיון"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
          <Button onClick={submit} loading={saving}>קביעה</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="מועד" required>
          <Input
            type="datetime-local"
            value={values.scheduled_at}
            onChange={(event) => setValues({ ...values, scheduled_at: event.target.value })}
          />
        </Field>
        <Field label="סוג">
          <Select
            options={INTERVIEW_KINDS}
            value={values.kind}
            onChange={(event) => setValues({ ...values, kind: event.target.value })}
          />
        </Field>
        <Field label="משרה">
          <Select
            options={jobs}
            placeholder="ללא"
            value={values.job_id}
            onChange={(event) => setValues({ ...values, job_id: event.target.value })}
          />
        </Field>
        <Field label="משך (דקות)">
          <Input
            type="number"
            value={values.duration_minutes}
            onChange={(event) => setValues({ ...values, duration_minutes: event.target.value })}
          />
        </Field>
        <Field label="מיקום">
          <Input
            value={values.location}
            onChange={(event) => setValues({ ...values, location: event.target.value })}
            placeholder="משרדי הלקוח / זום"
          />
        </Field>
        <Field label="מראיין">
          <Input
            value={values.interviewer}
            onChange={(event) => setValues({ ...values, interviewer: event.target.value })}
          />
        </Field>
      </div>
    </Modal>
  );
}
