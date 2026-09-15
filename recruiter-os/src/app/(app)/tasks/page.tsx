import { requireAuth } from '@/lib/auth/server';
import { listTasks, taskCounts } from '@/lib/domain/tasks';
import { listInterviews } from '@/lib/domain/interviews';
import { processDueRuns } from '@/lib/automations/engine';
import { Card, EmptyState, StatCard } from '@/components/ui';
import { Icon } from '@/components/ui/icons';
import { TaskChecklist } from '@/components/app/TaskChecklist';
import { NewTaskButton } from '@/components/app/NewTaskButton';
import { formatDateTime } from '@/lib/format';
import { endOfDay, startOfDay } from '@/lib/time';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'משימות — Recruiter OS' };

export default async function TasksPage() {
  const auth = await requireAuth();
  const orgId = auth.org.id;

  // Automations that were waiting on a delay become tasks the moment this page loads.
  processDueRuns(orgId);

  const counts = taskCounts(orgId);
  const overdue = listTasks(orgId, { status: 'open', scope: 'overdue', limit: 50 });
  const overdueIds = new Set(overdue.map((task) => task.id));
  const today = listTasks(orgId, { status: 'open', scope: 'today', limit: 50 }).filter(
    (task) => !overdueIds.has(task.id),
  );
  const week = listTasks(orgId, { status: 'open', scope: 'week', limit: 80 }).filter(
    (task) => !overdueIds.has(task.id) && !today.some((item) => item.id === task.id),
  );
  const later = listTasks(orgId, { status: 'open', limit: 120 }).filter(
    (task) =>
      !overdueIds.has(task.id) &&
      !today.some((item) => item.id === task.id) &&
      !week.some((item) => item.id === task.id),
  );
  const done = listTasks(orgId, { status: 'done', limit: 15 });
  const interviews = listInterviews(orgId, { from: startOfDay(), to: endOfDay(new Date(Date.now() + 6 * 86_400_000)), status: 'scheduled', limit: 20 });

  const sections = [
    { title: 'באיחור', tasks: overdue, tone: 'danger' as const },
    { title: 'להיום', tasks: today, tone: 'default' as const },
    { title: 'השבוע', tasks: week, tone: 'default' as const },
    { title: 'בהמשך', tasks: later, tone: 'default' as const },
  ].filter((section) => section.tasks.length > 0);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">משימות</h1>
          <p className="text-sm text-muted">{counts.open} משימות פתוחות</p>
        </div>
        <NewTaskButton />
      </header>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="פתוחות" value={counts.open} />
        <StatCard label="להיום" value={counts.today} />
        <StatCard label="באיחור" value={counts.overdue} tone={counts.overdue > 0 ? 'danger' : undefined} />
      </div>

      {sections.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Icon.CheckSquare size={30} />}
            title="אין משימות פתוחות"
            description="המערכת תיצור משימות אוטומטית כשמועמד לא עונה, כשלקוח לא חוזר עם פידבק, וכשמועמד מתחיל לעבוד."
            action={<NewTaskButton />}
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            {sections.map((section) => (
              <Card
                key={section.title}
                title={
                  <span className={section.tone === 'danger' ? 'text-danger' : undefined}>
                    {section.title}
                    <span className="num mr-1.5 text-xs text-faint">({section.tasks.length})</span>
                  </span>
                }
                bodyClassName="p-0"
              >
                <TaskChecklist tasks={section.tasks} />
              </Card>
            ))}
          </div>

          <div className="space-y-4">
            {interviews.length > 0 && (
              <Card title="ראיונות בשבוע הקרוב" bodyClassName="p-0">
                <ul className="divide-y divide-line">
                  {interviews.map((interview) => (
                    <li key={interview.id} className="px-4 py-2.5">
                      <p className="text-sm font-medium text-ink">{interview.candidate_name}</p>
                      <p className="text-xs text-muted">
                        {formatDateTime(interview.scheduled_at)} · {interview.job_title ?? 'ללא משרה'}
                        {interview.location ? ` · ${interview.location}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {done.length > 0 && (
              <Card title="הושלמו לאחרונה" bodyClassName="p-0">
                <TaskChecklist tasks={done} />
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
