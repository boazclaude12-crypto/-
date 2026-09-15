import Link from 'next/link';
import { requireAuth } from '@/lib/auth/server';
import { listJobs } from '@/lib/domain/jobs';
import { listClients } from '@/lib/domain/clients';
import { Badge, Card, EmptyState, LinkButton, Table, Td, Th } from '@/components/ui';
import { Icon } from '@/components/ui/icons';
import { FilterBar } from '@/components/app/FilterBar';
import { colorOf, JOB_PRIORITIES, JOB_STATUSES, labelOf } from '@/lib/domain/constants';
import { formatDate, salaryRange } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'משרות — Recruiter OS' };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function JobsPage({ searchParams }: PageProps) {
  const auth = await requireAuth();
  const params = await searchParams;

  const jobs = listJobs(auth.org.id, {
    q: first(params.q),
    status: first(params.status),
    clientId: first(params.clientId),
    priority: first(params.priority),
    limit: 100,
  });
  const clients = listClients(auth.org.id, { limit: 200 });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">משרות</h1>
          <p className="text-sm text-muted">{jobs.length} משרות</p>
        </div>
        <LinkButton href="/jobs/new" icon={<Icon.Plus size={16} />}>
          משרה חדשה
        </LinkButton>
      </header>

      <FilterBar
        searchPlaceholder="חיפוש משרה, עיר או דרישה…"
        filters={[
          { key: 'status', label: 'סטטוס', options: JOB_STATUSES },
          { key: 'priority', label: 'עדיפות', options: JOB_PRIORITIES },
          { key: 'clientId', label: 'לקוח', options: clients.map((c) => ({ value: c.id, label: c.name })) },
        ]}
      />

      <Card bodyClassName="p-0">
        {jobs.length === 0 ? (
          <EmptyState
            icon={<Icon.Briefcase size={28} />}
            title="אין משרות להצגה"
            description="פתח משרה חדשה כדי להתחיל לגייס — המערכת תציע לך מיד מועמדים מהמאגר."
            action={<LinkButton href="/jobs/new" size="sm">פתיחת משרה</LinkButton>}
          />
        ) : (
          <Table>
            <thead className="hairline">
              <tr>
                <Th>משרה</Th>
                <Th className="hidden sm:table-cell">לקוח</Th>
                <Th>סטטוס</Th>
                <Th className="hidden md:table-cell">שכר</Th>
                <Th>פייפליין</Th>
                <Th className="hidden lg:table-cell">ימים פתוחה</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {jobs.map((job) => (
                <tr key={job.id} className="transition hover:bg-brand-soft/40">
                  <Td>
                    <Link href={`/jobs/${job.id}`} className="block">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-ink">{job.title}</span>
                        {job.priority === 'urgent' && <Badge tone="rose">דחוף</Badge>}
                        {job.priority === 'high' && <Badge tone="amber">גבוהה</Badge>}
                      </span>
                      <span className="block text-xs text-faint">
                        {[job.city, job.headcount > 1 ? `${job.headcount} עובדים` : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </Link>
                  </Td>
                  <Td className="hidden sm:table-cell">
                    <span className="text-sm text-muted">{job.client_name ?? '—'}</span>
                  </Td>
                  <Td>
                    <Badge tone={colorOf(JOB_STATUSES, job.status)}>{labelOf(JOB_STATUSES, job.status)}</Badge>
                  </Td>
                  <Td className="hidden md:table-cell">
                    <span className="num text-sm text-muted">
                      {salaryRange(job.salary_min, job.salary_max, job.salary_period)}
                    </span>
                  </Td>
                  <Td>
                    <span className="flex items-center gap-2 text-xs">
                      <span className="num text-ink">{job.active_candidates} פעילים</span>
                      {job.sent_to_client > 0 && (
                        <span className="num text-faint">{job.sent_to_client} אצל הלקוח</span>
                      )}
                      {job.placed > 0 && <Badge tone="emerald">{job.placed} השמות</Badge>}
                    </span>
                  </Td>
                  <Td className="hidden lg:table-cell">
                    <span className={`num text-sm ${job.days_open > 21 ? 'text-warn' : 'text-muted'}`}>
                      {job.days_open}
                    </span>
                    <span className="block text-xs text-faint">מ־{formatDate(job.opened_at)}</span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
