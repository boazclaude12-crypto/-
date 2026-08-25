import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth/server';
import { getJobDetail } from '@/lib/domain/jobs';
import { pipelineForJob, pipelineStages } from '@/lib/domain/applications';
import { listTasks } from '@/lib/domain/tasks';
import { listPlacements } from '@/lib/domain/placements';
import { Badge, Card, EmptyState, LinkButton } from '@/components/ui';
import { Icon } from '@/components/ui/icons';
import { JobActions } from '@/components/app/JobActions';
import { KanbanBoard } from '@/components/app/KanbanBoard';
import { Timeline } from '@/components/app/Timeline';
import { TaskChecklist } from '@/components/app/TaskChecklist';
import { NoteComposer } from '@/components/app/DocumentPanel';
import {
  colorOf, EMPLOYMENT_TYPES, JOB_PRIORITIES, JOB_STATUSES, labelOf, REQUIREMENT_KINDS,
} from '@/lib/domain/constants';
import { formatDate, formatMoney, salaryRange } from '@/lib/format';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function JobDetailPage({ params }: PageProps) {
  const auth = await requireAuth();
  const { id } = await params;

  const detail = getJobDetail(auth.org.id, id);
  if (!detail) notFound();

  const { job } = detail;
  const stages = pipelineStages(auth.org.id);
  const cards = pipelineForJob(auth.org.id, id);
  const tasks = listTasks(auth.org.id, { jobId: id, status: 'open', limit: 8 });
  const placements = listPlacements(auth.org.id, { limit: 50 }).filter((placement) => placement.job_id === id);

  const feeText =
    job.fee_type === 'percent'
      ? `${job.fee_value}% משכר`
      : formatMoney(job.fee_value);

  const facts: Array<[string, string]> = [
    ['לקוח', job.client_name ?? '—'],
    ['מיקום', job.city ?? '—'],
    ['שכר', salaryRange(job.salary_min, job.salary_max, job.salary_period)],
    ['סוג העסקה', labelOf(EMPLOYMENT_TYPES, job.employment_type, '—')],
    ['שעות', job.hours ?? '—'],
    ['ימי עבודה', job.work_days ?? '—'],
    ['מספר עובדים', String(job.headcount)],
    ['עמלת השמה', feeText],
    ['נפתחה', formatDate(job.opened_at)],
    ['דדליין', job.deadline ? formatDate(job.deadline) : '—'],
  ];

  const formValues = {
    title: job.title,
    client_id: job.client_id ?? '',
    headcount: String(job.headcount),
    city: job.city ?? '',
    region: job.region ?? '',
    salary_min: job.salary_min != null ? String(job.salary_min) : '',
    salary_max: job.salary_max != null ? String(job.salary_max) : '',
    salary_period: job.salary_period,
    hours: job.hours ?? '',
    work_days: job.work_days ?? '',
    employment_type: job.employment_type ?? '',
    description: job.description ?? '',
    benefits: job.benefits ?? '',
    status: job.status,
    priority: job.priority,
    deadline: job.deadline ? job.deadline.slice(0, 10) : '',
    fee_type: job.fee_type,
    fee_value: String(job.fee_value),
    requirements: detail.requirements.map((requirement) => ({
      kind: requirement.kind,
      value: requirement.value,
      is_required: requirement.is_required === 1,
    })),
    tags: detail.tags.map((tag) => tag.name),
  };

  return (
    <div className="space-y-4">
      <Link href="/jobs" className="inline-flex items-center gap-1 text-sm text-muted hover:text-brand">
        <Icon.ArrowRight size={15} /> כל המשרות
      </Link>

      <header className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">{job.title}</h1>
              <Badge tone={colorOf(JOB_STATUSES, job.status)}>{labelOf(JOB_STATUSES, job.status)}</Badge>
              {job.priority !== 'normal' && (
                <Badge tone={colorOf(JOB_PRIORITIES, job.priority)}>{labelOf(JOB_PRIORITIES, job.priority)}</Badge>
              )}
              {detail.tags.map((tag) => (
                <Badge key={tag.id} tone="brand">#{tag.name}</Badge>
              ))}
            </div>
            <p className="mt-0.5 text-sm text-muted">
              {job.client_id ? (
                <Link href={`/clients/${job.client_id}`} className="hover:text-brand">
                  {job.client_name}
                </Link>
              ) : (
                'ללא לקוח'
              )}
              {job.city && ` · ${job.city}`}
              {` · ${job.days_open} ימים פתוחה`}
            </p>
          </div>
          <div className="flex gap-4 text-center">
            <div>
              <p className="num text-lg font-semibold text-ink">{job.active_candidates}</p>
              <p className="text-xs text-faint">בתהליך</p>
            </div>
            <div>
              <p className="num text-lg font-semibold text-ink">{job.sent_to_client}</p>
              <p className="text-xs text-faint">אצל הלקוח</p>
            </div>
            <div>
              <p className="num text-lg font-semibold text-ok">{job.placed}</p>
              <p className="text-xs text-faint">השמות</p>
            </div>
          </div>
        </div>

        <div className="mt-4 border-t border-line pt-4">
          <JobActions
            jobId={job.id}
            jobTitle={job.title}
            status={job.status}
            formValues={formValues}
            candidates={cards.map((card) => ({
              id: card.candidate_id,
              name: card.candidate_name,
              application_id: card.application_id,
            }))}
          />
        </div>
      </header>

      <Card
        title="פייפליין המשרה"
        action={
          <LinkButton href={`/jobs/${job.id}/matches`} size="sm" variant="subtle" icon={<Icon.Target size={14} />}>
            הוספת מועמדים
          </LinkButton>
        }
        bodyClassName="p-3"
      >
        {cards.length === 0 ? (
          <EmptyState
            icon={<Icon.Board size={28} />}
            title="אין עדיין מועמדים במשרה"
            description="הרץ התאמה מהמאגר כדי לראות מי מתאים ולהוסיף אותם בלחיצה."
            action={
              <LinkButton href={`/jobs/${job.id}/matches`} size="sm">
                מציאת מועמדים מתאימים
              </LinkButton>
            }
          />
        ) : (
          <KanbanBoard
            stages={stages.map((stage) => ({ key: stage.key, label: stage.label, color: stage.color }))}
            cards={cards}
          />
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {(job.description || job.benefits) && (
            <Card title="תיאור המשרה">
              {job.description && (
                <p className="whitespace-pre-wrap text-sm text-ink">{job.description}</p>
              )}
              {job.benefits && (
                <>
                  <p className="mt-3 text-xs font-semibold text-muted">יתרונות ותנאים</p>
                  <p className="whitespace-pre-wrap text-sm text-ink">{job.benefits}</p>
                </>
              )}
            </Card>
          )}

          <Card title="ציר זמן" bodyClassName="p-0">
            <div className="border-b border-line p-4">
              <NoteComposer jobId={job.id} />
            </div>
            <Timeline entries={detail.timeline} />
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="פרטי המשרה">
            <dl className="space-y-2">
              {facts.map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-xs text-faint">{label}</dt>
                  <dd className="min-w-0 truncate text-sm text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card title="דרישות">
            {detail.requirements.length === 0 ? (
              <p className="text-sm text-muted">
                לא הוגדרו דרישות מובנות. הוספת דרישות משפרת משמעותית את דיוק ההתאמה.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {detail.requirements.map((requirement) => (
                  <li key={requirement.id} className="flex items-center gap-2 text-sm">
                    <Badge tone={requirement.is_required ? 'rose' : 'slate'}>
                      {requirement.is_required ? 'חובה' : 'יתרון'}
                    </Badge>
                    <span className="text-ink">{requirement.value}</span>
                    <span className="text-xs text-faint">{labelOf(REQUIREMENT_KINDS, requirement.kind)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {placements.length > 0 && (
            <Card title="השמות" bodyClassName="p-0">
              <ul className="divide-y divide-line">
                {placements.map((placement) => (
                  <li key={placement.id} className="px-4 py-2.5">
                    <p className="text-sm font-medium text-ink">{placement.candidate_name}</p>
                    <p className="text-xs text-muted">
                      התחלה {formatDate(placement.start_date)} · עמלה {formatMoney(placement.fee_amount)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {tasks.length > 0 && (
            <Card title="משימות" bodyClassName="p-0">
              <TaskChecklist tasks={tasks} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
