import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth/server';
import { getCandidateDetail } from '@/lib/domain/candidates';
import { stagesFor } from '@/lib/domain/applications';
import { matchJobsForCandidate } from '@/lib/matching/service';
import { listMessages } from '@/lib/domain/messages';
import { listInterviews } from '@/lib/domain/interviews';
import { listTasks } from '@/lib/domain/tasks';
import { Avatar, Badge, Card, EmptyState, Table, Td, Th } from '@/components/ui';
import { Icon } from '@/components/ui/icons';
import { CandidateActions } from '@/components/app/CandidateActions';
import { DocumentPanel, NoteComposer } from '@/components/app/DocumentPanel';
import { Timeline } from '@/components/app/Timeline';
import { TaskChecklist } from '@/components/app/TaskChecklist';
import { MatchExplanation } from '@/components/app/MatchExplanation';
import {
  AVAILABILITY, ATTRIBUTE_KINDS, CANDIDATE_SOURCES, EMPLOYMENT_TYPES, labelOf, REGIONS,
} from '@/lib/domain/constants';
import { displayPhone, formatDate, formatDateTime, formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CandidateProfilePage({ params }: PageProps) {
  const auth = await requireAuth();
  const { id } = await params;

  const detail = getCandidateDetail(auth.org.id, id);
  if (!detail) notFound();

  const { candidate } = detail;
  const name = `${candidate.first_name} ${candidate.last_name}`.trim();
  const stages = stagesFor(auth.org.id);
  const stage = stages.find((item) => item.key === candidate.status_key);
  const matches = matchJobsForCandidate(auth.org.id, id, { limit: 6 });
  const messages = listMessages(auth.org.id, { candidateId: id, limit: 12 });
  const interviews = listInterviews(auth.org.id, { candidateId: id, limit: 10 });
  const tasks = listTasks(auth.org.id, { candidateId: id, status: 'open', limit: 10 });

  const facts: Array<[string, string]> = [
    ['טלפון', displayPhone(candidate.phone)],
    ['אימייל', candidate.email ?? '—'],
    ['עיר', candidate.city ?? '—'],
    ['אזור', labelOf(REGIONS, candidate.region, '—')],
    ['תפקיד נוכחי', candidate.current_role ?? '—'],
    ['שנות ניסיון', candidate.years_experience != null ? String(candidate.years_experience) : '—'],
    ['השכלה', candidate.education ?? '—'],
    ['שכר נוכחי', formatMoney(candidate.current_salary)],
    ['שכר רצוי', formatMoney(candidate.desired_salary)],
    ['זמינות', labelOf(AVAILABILITY, candidate.availability, '—')],
    ['סוג העסקה', labelOf(EMPLOYMENT_TYPES, candidate.employment_type, '—')],
    ['מקור הגעה', labelOf(CANDIDATE_SOURCES, candidate.source, '—')],
    ['נוצר', formatDate(candidate.created_at)],
    ['מגע אחרון', candidate.last_contact_at ? formatDate(candidate.last_contact_at) : 'טרם'],
  ];

  const formValues = {
    first_name: candidate.first_name,
    last_name: candidate.last_name,
    phone: candidate.phone ?? '',
    whatsapp: candidate.whatsapp ?? '',
    email: candidate.email ?? '',
    city: candidate.city ?? '',
    region: candidate.region ?? '',
    current_role: candidate.current_role ?? '',
    years_experience: candidate.years_experience != null ? String(candidate.years_experience) : '',
    education: candidate.education ?? '',
    current_salary: candidate.current_salary != null ? String(candidate.current_salary) : '',
    desired_salary: candidate.desired_salary != null ? String(candidate.desired_salary) : '',
    availability: candidate.availability ?? '',
    employment_type: candidate.employment_type ?? '',
    max_commute_km: candidate.max_commute_km != null ? String(candidate.max_commute_km) : '',
    has_car: candidate.has_car === 1,
    willing_to_relocate: candidate.willing_to_relocate === 1,
    source: candidate.source ?? '',
    notes: candidate.notes ?? '',
    attributes: detail.attributes.map((attribute) => ({ kind: attribute.kind, value: attribute.value })),
    experiences: detail.experiences.map((experience) => ({
      company: experience.company,
      title: experience.title,
      start_date: experience.start_date ?? '',
      end_date: experience.end_date ?? '',
      is_current: experience.is_current === 1,
      description: experience.description ?? '',
    })),
    tags: detail.tags.map((tag) => tag.name),
  };

  return (
    <div className="space-y-4">
      <Link href="/candidates" className="inline-flex items-center gap-1 text-sm text-muted hover:text-brand">
        <Icon.ArrowRight size={15} /> כל המועמדים
      </Link>

      <header className="card p-4">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar name={name} size={56} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">{name}</h1>
              <Badge tone={stage?.color ?? 'slate'}>{stage?.label ?? candidate.status_key}</Badge>
              {detail.tags.map((tag) => (
                <Badge key={tag.id} tone="brand">#{tag.name}</Badge>
              ))}
            </div>
            <p className="mt-0.5 text-sm text-muted">
              {[candidate.current_role, candidate.city, labelOf(AVAILABILITY, candidate.availability, '')]
                .filter(Boolean)
                .join(' · ') || 'אין עדיין פרטים נוספים'}
            </p>
          </div>
        </div>

        <div className="mt-4 border-t border-line pt-4">
          <CandidateActions
            candidate={{
              id: candidate.id,
              name,
              phone: candidate.phone,
              whatsapp: candidate.whatsapp,
              email: candidate.email,
              status_key: candidate.status_key,
            }}
            stages={stages.map((item) => ({ key: item.key, label: item.label }))}
            formValues={formValues}
          />
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="משרות מתאימות" action={<span className="text-xs text-faint">מדורג לפי ציון התאמה</span>} bodyClassName="p-0">
            {matches.length === 0 ? (
              <EmptyState
                title="אין כרגע משרות פתוחות מתאימות"
                description="פתח משרה חדשה או עדכן את פרטי המועמד כדי לשפר את ההתאמה."
              />
            ) : (
              <ul className="divide-y divide-line">
                {matches.map((match) => (
                  <li key={match.job.id} className="px-4 py-3">
                    <MatchExplanation
                      score={match.score}
                      title={match.job.title}
                      subtitle={[match.job.client_name, match.job.city].filter(Boolean).join(' · ')}
                      href={`/jobs/${match.job.id}`}
                      reasons={match.reasons}
                      gaps={match.gaps}
                      requirements={match.requirements}
                      distanceKm={match.distanceKm}
                      commute={match.commute}
                      breakdown={match.breakdown}
                      badge={match.alreadyApplied ? 'כבר בתהליך' : undefined}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="תהליכים פעילים" bodyClassName="p-0">
            {detail.applications.length === 0 ? (
              <EmptyState title="המועמד עדיין לא שויך למשרה" />
            ) : (
              <Table>
                <thead className="hairline">
                  <tr>
                    <Th>משרה</Th>
                    <Th className="hidden sm:table-cell">לקוח</Th>
                    <Th>שלב</Th>
                    <Th className="hidden sm:table-cell">התאמה</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {detail.applications.map((application) => {
                    const applicationStage = stages.find((item) => item.key === application.stage_key);
                    return (
                      <tr key={application.id}>
                        <Td>
                          <Link href={`/jobs/${application.job_id}`} className="font-medium text-ink hover:text-brand">
                            {application.job_title}
                          </Link>
                        </Td>
                        <Td className="hidden sm:table-cell">
                          <span className="text-sm text-muted">{application.client_name ?? '—'}</span>
                        </Td>
                        <Td>
                          <Badge tone={applicationStage?.color ?? 'slate'}>
                            {applicationStage?.label ?? application.stage_key}
                          </Badge>
                        </Td>
                        <Td className="hidden sm:table-cell">
                          <span className="num text-sm text-muted">
                            {application.match_score != null ? `${Math.round(application.match_score)}%` : '—'}
                          </span>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>

          <Card title="ציר זמן" bodyClassName="p-0">
            <div className="border-b border-line p-4">
              <NoteComposer candidateId={candidate.id} />
            </div>
            <Timeline entries={detail.timeline} />
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="פרטים">
            <dl className="space-y-2">
              {facts.map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-xs text-faint">{label}</dt>
                  <dd className="min-w-0 truncate text-sm text-ink" dir={label === 'טלפון' ? 'ltr' : undefined}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            {candidate.notes && (
              <p className="mt-3 whitespace-pre-wrap rounded-lg bg-bg p-3 text-sm text-muted">{candidate.notes}</p>
            )}
          </Card>

          <Card title="רישיונות והסמכות">
            {detail.attributes.length === 0 ? (
              <p className="text-sm text-muted">לא הוזנו.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {detail.attributes.map((attribute) => (
                  <Badge
                    key={attribute.id}
                    tone={
                      attribute.kind === 'license' ? 'sky'
                      : attribute.kind === 'certification' ? 'violet'
                      : attribute.kind === 'language' ? 'amber'
                      : 'slate'
                    }
                  >
                    {attribute.value}
                    <span className="opacity-60"> · {labelOf(ATTRIBUTE_KINDS, attribute.kind)}</span>
                  </Badge>
                ))}
              </div>
            )}
          </Card>

          <Card title="ניסיון תעסוקתי">
            {detail.experiences.length === 0 ? (
              <p className="text-sm text-muted">לא הוזן ניסיון.</p>
            ) : (
              <ol className="space-y-3">
                {detail.experiences.map((experience) => (
                  <li key={experience.id} className="border-r-2 border-line pr-3">
                    <p className="text-sm font-medium text-ink">{experience.title}</p>
                    <p className="text-xs text-muted">{experience.company}</p>
                    <p className="num text-xs text-faint">
                      {experience.start_date ?? '—'} – {experience.is_current ? 'היום' : experience.end_date ?? '—'}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card title="קורות חיים ומסמכים">
            <DocumentPanel candidateId={candidate.id} documents={detail.documents} />
          </Card>

          {tasks.length > 0 && (
            <Card title="משימות פתוחות" bodyClassName="p-0">
              <TaskChecklist tasks={tasks} showLinks={false} />
            </Card>
          )}

          {interviews.length > 0 && (
            <Card title="ראיונות" bodyClassName="p-0">
              <ul className="divide-y divide-line">
                {interviews.map((interview) => (
                  <li key={interview.id} className="px-4 py-2.5">
                    <p className="text-sm text-ink">{formatDateTime(interview.scheduled_at)}</p>
                    <p className="text-xs text-muted">
                      {interview.job_title ?? 'ללא משרה'} · {interview.status === 'completed' ? 'הסתיים' : 'מתוכנן'}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {messages.length > 0 && (
            <Card title="היסטוריית תקשורת" bodyClassName="p-0">
              <ul className="divide-y divide-line">
                {messages.map((message) => (
                  <li key={message.id} className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Badge tone={message.direction === 'in' ? 'emerald' : 'sky'}>
                        {message.channel}
                      </Badge>
                      <span className="text-xs text-faint">{formatDateTime(message.created_at)}</span>
                      {message.status === 'draft' && <Badge tone="amber">טיוטה</Badge>}
                    </div>
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-muted">{message.body}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
