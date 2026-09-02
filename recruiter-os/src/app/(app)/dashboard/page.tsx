import Link from 'next/link';
import { requireAuth } from '@/lib/auth/server';
import { getDashboard } from '@/lib/domain/dashboard';
import { nextBestActions } from '@/lib/domain/next-best-action';
import { processDueRuns } from '@/lib/automations/engine';
import { Badge, Card, Dot, EmptyState, LinkButton, StatCard } from '@/components/ui';
import { Icon } from '@/components/ui/icons';
import { formatMoney, formatTime, relativeTime } from '@/lib/format';
import { TaskChecklist } from '@/components/app/TaskChecklist';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'ראשי — Recruiter OS' };

export default async function DashboardPage() {
  const auth = await requireAuth();
  const orgId = auth.org.id;

  // Delayed automations (follow-ups, reminders) catch up whenever the desk is opened.
  processDueRuns(orgId);

  const data = getDashboard(orgId);
  const actions = nextBestActions(orgId, 6);
  const firstName = auth.user.name.split(' ')[0];

  const hasAnything = data.totals.candidates > 0 || data.totals.jobs > 0 || data.totals.clients > 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">שלום {firstName}</h1>
          <p className="text-sm text-muted">
            {data.today.taskCounts.open > 0
              ? `${data.today.taskCounts.open} משימות פתוחות · ${data.today.interviews.length} ראיונות היום`
              : 'אין משימות פתוחות. יום טוב להתחיל בו משהו חדש.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/candidates/new" variant="secondary" size="sm" icon={<Icon.Plus size={15} />}>
            מועמד
          </LinkButton>
          <LinkButton href="/jobs/new" variant="secondary" size="sm" icon={<Icon.Plus size={15} />}>
            משרה
          </LinkButton>
          <LinkButton href="/clients/new" variant="secondary" size="sm" icon={<Icon.Plus size={15} />}>
            לקוח
          </LinkButton>
          <LinkButton href="/assistant" size="sm" icon={<Icon.Sparkles size={15} />}>
            שאל את העוזר
          </LinkButton>
        </div>
      </header>

      {!hasAnything && (
        <Card>
          <EmptyState
            icon={<Icon.Target size={30} />}
            title="המערכת ריקה — בוא נמלא אותה"
            description="אפשר להוסיף מועמד ראשון, לפתוח משרה, או לטעון נתוני דמו מלאים כדי לראות איך הכול עובד."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <LinkButton href="/candidates/new" size="sm">הוספת מועמד</LinkButton>
                <LinkButton href="/settings" variant="secondary" size="sm">טעינת נתוני דמו</LinkButton>
              </div>
            }
          />
        </Card>
      )}

      {actions.length > 0 && (
        <Card
          title={
            <span className="flex items-center gap-2">
              <Icon.Bolt size={16} className="text-brand" />
              מה לעשות עכשיו
            </span>
          }
          action={<span className="text-xs text-faint">מדורג לפי דחיפות</span>}
          bodyClassName="p-0"
        >
          <ul className="divide-y divide-line">
            {actions.map((action) => (
              <li key={action.id}>
                <Link
                  href={action.href}
                  className="flex items-start gap-3 px-4 py-3 transition hover:bg-brand-soft/50"
                >
                  <span className="mt-1.5">
                    <Dot
                      tone={
                        action.severity === 'critical'
                          ? 'danger'
                          : action.severity === 'high'
                            ? 'warn'
                            : action.severity === 'medium'
                              ? 'info'
                              : 'muted'
                      }
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{action.title}</span>
                    <span className="block text-xs text-muted">{action.detail}</span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-brand">{action.actionLabel} ←</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted">כסף — החודש</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="הכנסה צפויה" value={formatMoney(data.money.expected)} href="/money" />
          <StatCard label="התקבל" value={formatMoney(data.money.received)} tone="ok" href="/money" />
          <StatCard
            label="ממתין לגבייה"
            value={formatMoney(data.money.pending)}
            sub={data.money.overdue > 0 ? `${formatMoney(data.money.overdue)} באיחור` : undefined}
            tone={data.money.overdue > 0 ? 'danger' : undefined}
            href="/money"
          />
          <StatCard label="השמות החודש" value={data.money.placements} href="/money" />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted">פייפליין</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="משרות פתוחות" value={data.pipeline.openJobs} href="/jobs" />
          <StatCard label="מועמדים פעילים" value={data.pipeline.activeCandidates} href="/pipeline" />
          <StatCard label="בראיון" value={data.pipeline.inInterview} href="/pipeline" />
          <StatCard label="נשלחו ללקוח" value={data.pipeline.sentToClient} href="/pipeline" />
          <StatCard label="התקבלו" value={data.pipeline.hired} tone="ok" href="/pipeline" />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="המשימות של היום"
          action={<Link href="/tasks" className="text-xs font-medium text-brand">כל המשימות ←</Link>}
          bodyClassName="p-0"
        >
          {data.today.tasks.length === 0 ? (
            <EmptyState title="אין משימות להיום" description="כל מה שתזמנת כבר טופל." />
          ) : (
            <TaskChecklist tasks={data.today.tasks} />
          )}
        </Card>

        <Card
          title="ראיונות היום"
          action={<Link href="/pipeline" className="text-xs font-medium text-brand">פייפליין ←</Link>}
          bodyClassName="p-0"
        >
          {data.today.interviews.length === 0 ? (
            <EmptyState title="אין ראיונות היום" />
          ) : (
            <ul className="divide-y divide-line">
              {data.today.interviews.map((interview) => (
                <li key={interview.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="num rounded-md bg-brand-soft px-2 py-1 text-sm font-semibold text-brand">
                    {formatTime(interview.scheduled_at)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <Link
                      href={`/candidates/${interview.candidate_id}`}
                      className="block truncate text-sm font-medium text-ink hover:text-brand"
                    >
                      {interview.candidate_name}
                    </Link>
                    <span className="block truncate text-xs text-muted">
                      {interview.job_title ?? 'ללא משרה'}
                      {interview.location ? ` · ${interview.location}` : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="מועמדים שצריך לחזור אליהם" bodyClassName="p-0">
          {data.today.callbacks.length === 0 ? (
            <EmptyState title="אין מי שממתין לך" description="כל המועמדים הפעילים קיבלו מענה." />
          ) : (
            <ul className="divide-y divide-line">
              {data.today.callbacks.map((callback) => (
                <li key={callback.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Link
                    href={`/candidates/${callback.id}`}
                    className="min-w-0 flex-1 truncate text-sm font-medium text-ink hover:text-brand"
                  >
                    {callback.name}
                  </Link>
                  <Badge tone={callback.days >= 5 ? 'rose' : 'amber'}>{callback.days} ימים</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="לקוחות שממתינים לעדכון" bodyClassName="p-0">
          {data.today.clientsWaiting.length === 0 ? (
            <EmptyState title="אין לקוחות בהמתנה" description="כל מי שקיבל מועמד כבר חזר אליך." />
          ) : (
            <ul className="divide-y divide-line">
              {data.today.clientsWaiting.map((waiting) => (
                <li key={waiting.application_id} className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/clients/${waiting.client_id}`}
                      className="min-w-0 flex-1 truncate text-sm font-medium text-ink hover:text-brand"
                    >
                      {waiting.client_name}
                    </Link>
                    <Badge tone={waiting.hours_waiting >= 72 ? 'rose' : 'amber'}>
                      {waiting.hours_waiting} שע׳
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-muted">
                    {waiting.candidate_name} · {waiting.job_title}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {data.today.urgentJobs.length > 0 && (
        <Card title="משרות דחופות" bodyClassName="p-0">
          <ul className="divide-y divide-line">
            {data.today.urgentJobs.map((job) => (
              <li key={job.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <Link
                  href={`/jobs/${job.id}`}
                  className="min-w-0 flex-1 truncate text-sm font-medium text-ink hover:text-brand"
                >
                  {job.title}
                  {job.client_name && <span className="text-muted"> · {job.client_name}</span>}
                </Link>
                <Badge tone={job.priority === 'urgent' ? 'rose' : 'amber'}>
                  {job.priority === 'urgent' ? 'דחוף' : 'עדיפות גבוהה'}
                </Badge>
                <span className="num text-xs text-faint">{job.days_open} ימים פתוחה</span>
                <span className="num text-xs text-faint">{job.active_candidates} מועמדים</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="text-center text-xs text-faint">
        עודכן {relativeTime(new Date().toISOString())} · {data.totals.candidates} מועמדים ·{' '}
        {data.totals.jobs} משרות · {data.totals.clients} לקוחות
      </p>
    </div>
  );
}
