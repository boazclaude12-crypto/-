import { getDb } from '../db/index';
import { labelOf, CANDIDATE_SOURCES } from './constants';

export interface FunnelStep {
  label: string;
  count: number;
  rate: number | null;
}

export interface AnalyticsData {
  totals: {
    candidates: number;
    jobs: number;
    openJobs: number;
    clients: number;
    applications: number;
    interviews: number;
    placements: number;
  };
  rates: {
    successRate: number;
    candidateToInterview: number;
    interviewToPlacement: number;
    sentToClientToPlacement: number;
    avgDaysToFill: number | null;
    avgDaysToFirstContact: number | null;
  };
  funnel: FunnelStep[];
  sources: Array<{ source: string; label: string; candidates: number; placements: number }>;
  revenueByMonth: Array<{ month: string; expected: number; received: number; placements: number }>;
  revenueByClient: Array<{ client_id: string; client_name: string; received: number; pending: number; placements: number }>;
  topJobs: Array<{ id: string; title: string; applications: number; placements: number; days_open: number }>;
}

function rate(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/** Every number here is computed from the user's own rows — nothing is estimated. */
export function getAnalytics(orgId: string, months = 6): AnalyticsData {
  const db = getDb();

  const totals = db.get<{
    candidates: number; jobs: number; open_jobs: number; clients: number;
    applications: number; interviews: number; placements: number;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM candidates WHERE org_id = $org) AS candidates,
       (SELECT COUNT(*) FROM jobs WHERE org_id = $org) AS jobs,
       (SELECT COUNT(*) FROM jobs WHERE org_id = $org AND status IN ('open','sourcing')) AS open_jobs,
       (SELECT COUNT(*) FROM clients WHERE org_id = $org) AS clients,
       (SELECT COUNT(*) FROM applications WHERE org_id = $org) AS applications,
       (SELECT COUNT(*) FROM interviews WHERE org_id = $org) AS interviews,
       (SELECT COUNT(*) FROM placements WHERE org_id = $org AND status != 'fallen_through') AS placements`
      .replace(/\$org/g, '?'),
    orgId, orgId, orgId, orgId, orgId, orgId, orgId,
  )!;

  const funnelRow = db.get<{
    total: number; contacted: number; screened: number; interviewed: number; sent: number; hired: number;
  }>(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE stage_key NOT IN ('new')) AS contacted,
       COUNT(*) FILTER (WHERE stage_key IN ('screening','interview','sent_to_client','client_interview','hired','started')) AS screened,
       COUNT(*) FILTER (WHERE stage_key IN ('interview','sent_to_client','client_interview','hired','started')) AS interviewed,
       COUNT(*) FILTER (WHERE stage_key IN ('sent_to_client','client_interview','hired','started')) AS sent,
       COUNT(*) FILTER (WHERE stage_key IN ('hired','started')) AS hired
     FROM applications WHERE org_id = ?`,
    orgId,
  )!;

  const funnel: FunnelStep[] = [
    { label: 'שיוכים למשרות', count: funnelRow.total, rate: null },
    { label: 'נוצר קשר', count: funnelRow.contacted, rate: rate(funnelRow.contacted, funnelRow.total) },
    { label: 'סינון', count: funnelRow.screened, rate: rate(funnelRow.screened, funnelRow.total) },
    { label: 'ראיון', count: funnelRow.interviewed, rate: rate(funnelRow.interviewed, funnelRow.total) },
    { label: 'נשלח ללקוח', count: funnelRow.sent, rate: rate(funnelRow.sent, funnelRow.total) },
    { label: 'התקבל', count: funnelRow.hired, rate: rate(funnelRow.hired, funnelRow.total) },
  ];

  const timing = db.get<{ avg_fill: number | null; avg_contact: number | null }>(
    `SELECT
       (SELECT AVG(julianday(p.start_date) - julianday(j.opened_at))
          FROM placements p JOIN jobs j ON j.id = p.job_id
         WHERE p.org_id = ? AND p.status != 'fallen_through') AS avg_fill,
       (SELECT AVG(julianday(c.last_contact_at) - julianday(c.created_at))
          FROM candidates c WHERE c.org_id = ? AND c.last_contact_at IS NOT NULL) AS avg_contact`,
    orgId, orgId,
  );

  const sources = db.all<{ source: string; candidates: number; placements: number }>(
    `SELECT COALESCE(c.source, 'unknown') AS source,
            COUNT(DISTINCT c.id) AS candidates,
            COUNT(DISTINCT p.id) AS placements
       FROM candidates c
  LEFT JOIN placements p ON p.candidate_id = c.id AND p.status != 'fallen_through'
      WHERE c.org_id = ?
      GROUP BY COALESCE(c.source, 'unknown')
      ORDER BY candidates DESC`,
    orgId,
  );

  const revenueByMonth = db.all<{ month: string; expected: number; received: number; placements: number }>(
    `SELECT strftime('%Y-%m', COALESCE(pay.due_date, pay.created_at)) AS month,
            COALESCE(SUM(pay.amount), 0) AS expected,
            COALESCE(SUM(CASE WHEN pay.status = 'paid' THEN pay.amount ELSE 0 END), 0) AS received,
            COUNT(DISTINCT pay.placement_id) AS placements
       FROM payments pay
      WHERE pay.org_id = ? AND pay.status != 'written_off'
        AND COALESCE(pay.due_date, pay.created_at) >= date('now', ?)
      GROUP BY month ORDER BY month`,
    orgId, `-${months} months`,
  );

  const revenueByClient = db.all<{
    client_id: string; client_name: string; received: number; pending: number; placements: number;
  }>(
    `SELECT c.id AS client_id, c.name AS client_name,
            COALESCE(SUM(CASE WHEN pay.status = 'paid' THEN pay.amount ELSE 0 END), 0) AS received,
            COALESCE(SUM(CASE WHEN pay.status IN ('expected','invoiced','overdue') THEN pay.amount ELSE 0 END), 0) AS pending,
            (SELECT COUNT(*) FROM placements p WHERE p.client_id = c.id AND p.status != 'fallen_through') AS placements
       FROM clients c LEFT JOIN payments pay ON pay.client_id = c.id
      WHERE c.org_id = ?
      GROUP BY c.id, c.name
     HAVING received > 0 OR pending > 0 OR placements > 0
      ORDER BY received DESC, pending DESC LIMIT 12`,
    orgId,
  );

  const topJobs = db.all<{ id: string; title: string; applications: number; placements: number; days_open: number }>(
    `SELECT j.id, j.title,
            (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) AS applications,
            (SELECT COUNT(*) FROM placements p WHERE p.job_id = j.id AND p.status != 'fallen_through') AS placements,
            CAST(julianday(COALESCE(j.closed_at, 'now')) - julianday(j.opened_at) AS INTEGER) AS days_open
       FROM jobs j WHERE j.org_id = ?
      ORDER BY applications DESC LIMIT 8`,
    orgId,
  );

  return {
    totals: {
      candidates: totals.candidates,
      jobs: totals.jobs,
      openJobs: totals.open_jobs,
      clients: totals.clients,
      applications: totals.applications,
      interviews: totals.interviews,
      placements: totals.placements,
    },
    rates: {
      successRate: rate(funnelRow.hired, funnelRow.total),
      candidateToInterview: rate(funnelRow.interviewed, funnelRow.total),
      interviewToPlacement: rate(funnelRow.hired, funnelRow.interviewed),
      sentToClientToPlacement: rate(funnelRow.hired, funnelRow.sent),
      avgDaysToFill: timing?.avg_fill != null ? Math.round(timing.avg_fill) : null,
      avgDaysToFirstContact: timing?.avg_contact != null ? Math.round(timing.avg_contact * 10) / 10 : null,
    },
    funnel,
    sources: sources.map((row) => ({
      ...row,
      label: row.source === 'unknown' ? 'לא ידוע' : labelOf(CANDIDATE_SOURCES, row.source),
    })),
    revenueByMonth,
    revenueByClient,
    topJobs,
  };
}
