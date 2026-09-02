import { requireAuth } from '@/lib/auth/server';
import { repos } from '@/lib/db/repos';
import { Card } from '@/components/ui';
import { AutomationList } from '@/components/app/AutomationList';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'אוטומציות — Recruiter OS' };

export default async function AutomationsPage() {
  const auth = await requireAuth();
  const orgId = auth.org.id;

  const automations = repos.automations.list(orgId, { orderBy: 'created_at ASC' });
  const runs = repos.automationRuns.list(orgId, { orderBy: 'created_at DESC', limit: 30 });
  const automationById = new Map(automations.map((automation) => [automation.id, automation]));

  const enabled = automations.filter((automation) => automation.is_enabled === 1).length;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-ink">אוטומציות</h1>
        <p className="text-sm text-muted">
          {enabled} מתוך {automations.length} כללים פעילים. כל כלל רץ על אירוע אמיתי במערכת ויוצר משימה או טיוטת הודעה.
        </p>
      </header>

      <AutomationList
        automations={automations.map((automation) => ({
          id: automation.id,
          key: automation.key,
          name: automation.name,
          description: automation.description,
          trigger_event: automation.trigger_event,
          action_type: automation.action_type,
          delay_minutes: automation.delay_minutes,
          is_enabled: automation.is_enabled === 1,
        }))}
      />

      <Card title="הרצות אחרונות" bodyClassName="p-0">
        {runs.length === 0 ? (
          <p className="py-8 text-center text-sm text-faint">
            עדיין לא רצו אוטומציות. הן יופעלו אוטומטית כשתוסיף מועמד, תשלח הודעה או תעביר מועמד ללקוח.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {runs.map((run) => {
              const automation = automationById.get(run.automation_id);
              const statusLabel =
                run.status === 'done' ? 'בוצע'
                : run.status === 'pending' ? 'ממתין'
                : run.status === 'cancelled' ? 'בוטל'
                : run.status === 'skipped' ? 'דולג'
                : 'נכשל';
              const tone =
                run.status === 'done' ? 'text-ok'
                : run.status === 'failed' ? 'text-danger'
                : run.status === 'pending' ? 'text-warn'
                : 'text-faint';
              return (
                <li key={run.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{automation?.name ?? run.automation_id}</span>
                    <span className="block truncate text-xs text-faint">
                      {run.trigger_event}
                      {run.error ? ` · ${run.error}` : ''}
                    </span>
                  </span>
                  <span className={`text-xs font-medium ${tone}`}>{statusLabel}</span>
                  <span className="num text-xs text-faint">
                    {new Date(run.executed_at ?? run.run_at).toLocaleString('he-IL', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
