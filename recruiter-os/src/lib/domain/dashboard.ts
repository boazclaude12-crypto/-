import { getDb } from '../db/index';
import { repos } from '../db/repos';
import { endOfDay, endOfMonth, startOfDay, startOfMonth } from '../time';
import { clientsAwaitingFeedback } from './clients';
import { interviewsToday, type InterviewListItem } from './interviews';
import { listTasks, taskCounts, type TaskListItem } from './tasks';
import { revenueThisMonth, type RevenueSummary } from './payments';
import { ACTIVE_JOB_STATUSES } from './constants';

export interface DashboardData {
  today: {
    tasks: TaskListItem[];
    taskCounts: ReturnType<typeof taskCounts>;
    interviews: InterviewListItem[];
    callbacks: Array<{ id: string; name: string; days: number; phone: string | null }>;
    clientsWaiting: ReturnType<typeof clientsAwaitingFeedback>;
    urgentJobs: Array<{ id: string; title: string; client_name: string | null; days_open: number; active_candidates: number; priority: string }>;
  };
  pipeline: {
    openJobs: number;
    activeCandidates: number;
    inInterview: number;
    sentToClient: number;
    hired: number;
    placementsThisMonth: number;
    byStage: Array<{ stage_key: string; label: string; color: string; count: number }>;
  };
  money: RevenueSummary & { collectible: number };
  totals: { candidates: number; jobs: number; clients: number };
}

/** Single query pass that powers the home screen. */
export function getDashboard(orgId: string): DashboardData {
  const db = getDb();
  const monthStart = startOfMonth();
  const monthEnd = endOfMonth();

  const stageCounts = db.all<{ stage_key: string; label: string; color: string; count: number }>(
    `SELECT s.key AS stage_key, s.label, s.color, COUNT(a.id) AS count
       FROM stages s
  LEFT JOIN applications a ON a.stage_key = s.key AND a.org_id = s.org_id AND a.status = 'active'
      WHERE s.org_id = ? AND s.in_pipeline = 1
      GROUP BY s.key, s.label, s.color, s.sort_order
      ORDER BY s.sort_order`,
    orgId,
  );

  const pipelineRow = db.get<{
    active_candidates: number; in_interview: number; sent_to_client: number; hired: number;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'active') AS active_candidates,
       COUNT(*) FILTER (WHERE status = 'active' AND stage_key IN ('interview','client_interview')) AS in_interview,
       COUNT(*) FILTER (WHERE status = 'active' AND stage_key = 'sent_to_client') AS sent_to_client,
       COUNT(*) FILTER (WHERE stage_key IN ('hired','started')) AS hired
     FROM applications WHERE org_id = ?`,
    orgId,
  );

  const openJobs = repos.jobs.count(
    orgId,
    `status IN (${ACTIVE_JOB_STATUSES.map(() => '?').join(', ')})`,
    ACTIVE_JOB_STATUSES,
  );

  const placementsThisMonth = db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM placements
      WHERE org_id = ? AND status != 'fallen_through' AND start_date BETWEEN ? AND ?`,
    orgId, monthStart.slice(0, 10), monthEnd.slice(0, 10),
  );

  // Candidates that were promised a call-back and have gone quiet.
  const callbacks = db.all<{ id: string; name: string; days: number; phone: string | null }>(
    `SELECT c.id, (c.first_name || ' ' || c.last_name) AS name, c.phone,
            CAST(julianday('now') - julianday(COALESCE(c.last_contact_at, c.created_at)) AS INTEGER) AS days
       FROM candidates c
      WHERE c.org_id = ?
        AND c.status_key IN ('new','contacted','interested','screening')
        AND julianday('now') - julianday(COALESCE(c.last_contact_at, c.created_at)) >= 2
      ORDER BY days DESC LIMIT 8`,
    orgId,
  );

  const urgentJobs = db.all<{
    id: string; title: string; client_name: string | null; days_open: number;
    active_candidates: number; priority: string;
  }>(
    `SELECT j.id, j.title, cl.name AS client_name, j.priority,
            CAST(julianday('now') - julianday(j.opened_at) AS INTEGER) AS days_open,
            (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id AND a.status = 'active') AS active_candidates
       FROM jobs j LEFT JOIN clients cl ON cl.id = j.client_id
      WHERE j.org_id = ? AND j.status IN ('open','sourcing')
        AND (j.priority IN ('urgent','high') OR (j.deadline IS NOT NULL AND j.deadline <= date('now','+7 day')))
      ORDER BY CASE j.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, days_open DESC
      LIMIT 6`,
    orgId,
  );

  const money = revenueThisMonth(orgId);
  const collectible = db.get<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM payments
      WHERE org_id = ? AND status IN ('expected','invoiced','overdue')`,
    orgId,
  );

  return {
    today: {
      tasks: listTasks(orgId, { status: 'open', scope: 'today', limit: 10 }),
      taskCounts: taskCounts(orgId),
      interviews: interviewsToday(orgId),
      callbacks,
      clientsWaiting: clientsAwaitingFeedback(orgId, 24).slice(0, 6),
      urgentJobs,
    },
    pipeline: {
      openJobs,
      activeCandidates: pipelineRow?.active_candidates ?? 0,
      inInterview: pipelineRow?.in_interview ?? 0,
      sentToClient: pipelineRow?.sent_to_client ?? 0,
      hired: pipelineRow?.hired ?? 0,
      placementsThisMonth: placementsThisMonth?.n ?? 0,
      byStage: stageCounts,
    },
    money: { ...money, collectible: collectible?.total ?? 0 },
    totals: {
      candidates: repos.candidates.count(orgId),
      jobs: repos.jobs.count(orgId),
      clients: repos.clients.count(orgId),
    },
  };
}

export function todayRange() {
  return { from: startOfDay(), to: endOfDay() };
}
