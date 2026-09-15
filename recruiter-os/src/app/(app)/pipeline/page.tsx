import { requireAuth } from '@/lib/auth/server';
import { getDb } from '@/lib/db/index';
import { pipelineStages } from '@/lib/domain/applications';
import { listJobs } from '@/lib/domain/jobs';
import { Card, EmptyState, LinkButton } from '@/components/ui';
import { Icon } from '@/components/ui/icons';
import { KanbanBoard, type KanbanCard } from '@/components/app/KanbanBoard';
import { FilterBar } from '@/components/app/FilterBar';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'פייפליין — Recruiter OS' };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PipelinePage({ searchParams }: PageProps) {
  const auth = await requireAuth();
  const params = await searchParams;
  const jobId = first(params.jobId);

  const stages = pipelineStages(auth.org.id);
  const jobs = listJobs(auth.org.id, { activeOnly: true, limit: 200 });

  // One board across every open job, optionally narrowed to a single job.
  const cards = getDb().all<KanbanCard>(
    `SELECT a.id AS application_id, a.candidate_id,
            (c.first_name || ' ' || c.last_name) AS candidate_name,
            c.city, c.current_role, a.stage_key, a.status, a.match_score, a.updated_at,
            j.title AS job_title,
            CAST((julianday('now') - julianday(a.stage_changed_at)) AS INTEGER) AS days_in_stage,
            (SELECT i.scheduled_at FROM interviews i
              WHERE i.application_id = a.id AND i.status = 'scheduled'
              ORDER BY i.scheduled_at ASC LIMIT 1) AS next_interview_at
       FROM applications a
       JOIN candidates c ON c.id = a.candidate_id
       JOIN jobs j ON j.id = a.job_id
      WHERE a.org_id = ? AND a.status = 'active'
        AND j.status IN ('open','sourcing')
        ${jobId ? 'AND a.job_id = ?' : ''}
      ORDER BY a.match_score DESC, a.updated_at DESC
      LIMIT 500`,
    ...(jobId ? [auth.org.id, jobId] : [auth.org.id]),
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">פייפליין</h1>
          <p className="text-sm text-muted">
            {cards.length} מועמדים בתהליך על פני {jobs.length} משרות פעילות · גרור כרטיס כדי לשנות שלב
          </p>
        </div>
        <LinkButton href="/jobs" variant="secondary" size="sm" icon={<Icon.Briefcase size={15} />}>
          כל המשרות
        </LinkButton>
      </header>

      <FilterBar
        searchPlaceholder="לסינון מהיר השתמש בבחירת משרה"
        filters={[{ key: 'jobId', label: 'משרה', options: jobs.map((job) => ({ value: job.id, label: job.title })) }]}
      />

      {cards.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Icon.Board size={30} />}
            title="אין מועמדים בתהליך"
            description="שייך מועמדים למשרה פתוחה כדי לראות אותם כאן ולנהל את התקדמותם."
            action={<LinkButton href="/jobs" size="sm">מעבר למשרות</LinkButton>}
          />
        </Card>
      ) : (
        <Card bodyClassName="p-3">
          <KanbanBoard
            stages={stages.map((stage) => ({ key: stage.key, label: stage.label, color: stage.color }))}
            cards={cards}
            showJob={!jobId}
          />
        </Card>
      )}
    </div>
  );
}
