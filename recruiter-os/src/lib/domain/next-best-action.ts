import { getDb } from '../db/index';
import { clientsAwaitingFeedback } from './clients';
import { jobsNeedingAttention } from './jobs';
import { listTasks } from './tasks';
import { interviewsToday } from './interviews';
import { refreshOverdue } from './payments';
import { daysBetween, hoursBetween, startOfDay } from '../time';

export type ActionSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface NextAction {
  id: string;
  severity: ActionSeverity;
  title: string;
  detail: string;
  /** Where the user lands when acting on it. */
  href: string;
  actionLabel: string;
  kind: string;
  entityId: string | null;
}

const SEVERITY_ORDER: Record<ActionSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/**
 * Turns the current state of the desk into a ranked list of "do this next".
 *
 * Every rule below is something that costs a freelance recruiter money when it slips:
 * a client left waiting, a candidate going cold, a job with no pipeline, unpaid commission.
 */
export function nextBestActions(orgId: string, limit = 8): NextAction[] {
  const db = getDb();
  const actions: NextAction[] = [];

  // 1. Clients waiting on feedback we promised to chase.
  for (const waiting of clientsAwaitingFeedback(orgId, 24).slice(0, 5)) {
    const hours = waiting.hours_waiting;
    actions.push({
      id: `feedback:${waiting.application_id}`,
      severity: hours >= 72 ? 'critical' : 'high',
      title: `${waiting.client_name} ממתין לפידבק כבר ${hours} שעות`,
      detail: `${waiting.candidate_name} נשלח למשרת ${waiting.job_title} ועדיין אין תשובה.`,
      href: `/clients/${waiting.client_id}`,
      actionLabel: 'לגבות פידבק',
      kind: 'client_feedback',
      entityId: waiting.client_id,
    });
  }

  // 2. Overdue tasks.
  const overdue = listTasks(orgId, { status: 'open', scope: 'overdue', limit: 5 });
  for (const task of overdue) {
    actions.push({
      id: `task:${task.id}`,
      severity: task.priority === 'urgent' ? 'critical' : 'high',
      title: `משימה באיחור: ${task.title}`,
      detail: task.due_at ? `היעד היה לפני ${Math.max(1, daysBetween(task.due_at))} ימים.` : 'ללא תאריך יעד.',
      href: '/tasks',
      actionLabel: 'לטפל',
      kind: 'task_overdue',
      entityId: task.id,
    });
  }

  // 3. Candidates who were contacted and never replied.
  const silent = db.all<{ candidate_id: string; name: string; last_sent: string }>(
    `SELECT m.candidate_id, (c.first_name || ' ' || c.last_name) AS name, MAX(m.sent_at) AS last_sent
       FROM messages m
       JOIN candidates c ON c.id = m.candidate_id
      WHERE m.org_id = ? AND m.direction = 'out' AND m.status = 'sent' AND m.candidate_id IS NOT NULL
        AND c.status_key NOT IN ('hired','started','rejected','not_interested','irrelevant')
        AND NOT EXISTS (
          SELECT 1 FROM messages r
           WHERE r.candidate_id = m.candidate_id AND r.direction = 'in' AND r.created_at > m.sent_at
        )
      GROUP BY m.candidate_id
      HAVING julianday('now') - julianday(MAX(m.sent_at)) >= 2
      ORDER BY last_sent ASC LIMIT 5`,
    orgId,
  );
  for (const candidate of silent) {
    const days = Math.max(2, daysBetween(candidate.last_sent));
    actions.push({
      id: `silent:${candidate.candidate_id}`,
      severity: days >= 5 ? 'high' : 'medium',
      title: `${candidate.name} לא חזר אליך ${days} ימים`,
      detail: 'שווה הודעת מעקב קצרה או שיחת טלפון.',
      href: `/candidates/${candidate.candidate_id}`,
      actionLabel: 'לשלוח מעקב',
      kind: 'candidate_silent',
      entityId: candidate.candidate_id,
    });
  }

  // 4. Jobs that have been open a long time with almost no pipeline.
  for (const job of jobsNeedingAttention(orgId, 14, 2).slice(0, 4)) {
    actions.push({
      id: `job:${job.id}`,
      severity: job.priority === 'urgent' ? 'high' : 'medium',
      title: `המשרה ${job.title} פתוחה ${job.days_open} ימים עם ${job.active_candidates} מועמדים`,
      detail: 'כדאי להריץ התאמה מהמאגר ולהוסיף מועמדים לפייפליין.',
      href: `/jobs/${job.id}/matches`,
      actionLabel: 'למצוא מועמדים',
      kind: 'job_stale',
      entityId: job.id,
    });
  }

  // 5. Interviews happening today.
  for (const interview of interviewsToday(orgId).slice(0, 3)) {
    const hours = Math.abs(hoursBetween(new Date().toISOString(), interview.scheduled_at));
    actions.push({
      id: `interview:${interview.id}`,
      severity: 'medium',
      title: `ראיון היום: ${interview.candidate_name}`,
      detail: `${interview.job_title ?? 'ללא משרה'} · בעוד כ-${hours} שעות${interview.location ? ` · ${interview.location}` : ''}`,
      href: `/candidates/${interview.candidate_id}`,
      actionLabel: 'לפתוח מועמד',
      kind: 'interview_today',
      entityId: interview.id,
    });
  }

  // 6. Money that is late.
  refreshOverdue(orgId);
  const latePayments = db.all<{ id: string; amount: number; client_name: string; due_date: string }>(
    `SELECT p.id, p.amount, c.name AS client_name, p.due_date
       FROM payments p JOIN clients c ON c.id = p.client_id
      WHERE p.org_id = ? AND p.status = 'overdue'
      ORDER BY p.due_date ASC LIMIT 4`,
    orgId,
  );
  for (const payment of latePayments) {
    actions.push({
      id: `payment:${payment.id}`,
      severity: 'critical',
      title: `תשלום באיחור: ₪${payment.amount.toLocaleString('he-IL')} מ${payment.client_name}`,
      detail: `תאריך היעד היה ${payment.due_date}.`,
      href: '/money',
      actionLabel: 'לטפל בגבייה',
      kind: 'payment_overdue',
      entityId: payment.id,
    });
  }

  // 7. Placements where nobody confirmed the candidate actually started.
  const unconfirmed = db.all<{ id: string; name: string; client_name: string; start_date: string }>(
    `SELECT p.id, (c.first_name || ' ' || c.last_name) AS name, cl.name AS client_name, p.start_date
       FROM placements p
       JOIN candidates c ON c.id = p.candidate_id
       JOIN clients cl ON cl.id = p.client_id
      WHERE p.org_id = ? AND p.status = 'active' AND p.start_date <= ?
      ORDER BY p.start_date ASC LIMIT 3`,
    orgId, startOfDay(),
  );
  for (const placement of unconfirmed) {
    actions.push({
      id: `placement:${placement.id}`,
      severity: 'high',
      title: `לוודא ש${placement.name} התחיל לעבוד`,
      detail: `תאריך התחלה מתוכנן: ${placement.start_date} אצל ${placement.client_name}.`,
      href: '/money',
      actionLabel: 'לאשר תחילת עבודה',
      kind: 'placement_unconfirmed',
      entityId: placement.id,
    });
  }

  // 8. Brand-new candidates nobody has contacted yet.
  const untouched = db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM candidates
      WHERE org_id = ? AND status_key = 'new' AND last_contact_at IS NULL
        AND julianday('now') - julianday(created_at) >= 1`,
    orgId,
  );
  if ((untouched?.n ?? 0) > 0) {
    actions.push({
      id: 'new-candidates',
      severity: 'medium',
      title: `${untouched!.n} מועמדים חדשים שטרם יצרת איתם קשר`,
      detail: 'מועמד שלא נענה ביממה הראשונה כמעט תמיד הולך למתחרה.',
      href: '/candidates?status=new',
      actionLabel: 'לפתוח רשימה',
      kind: 'candidates_untouched',
      entityId: null,
    });
  }

  return actions
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    .slice(0, limit);
}

export function severityColor(severity: ActionSeverity): string {
  switch (severity) {
    case 'critical': return 'danger';
    case 'high': return 'warn';
    case 'medium': return 'info';
    default: return 'muted';
  }
}
