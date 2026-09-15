import { getDb } from '../db/index';
import { clientsAwaitingFeedback } from './clients';
import { jobsNeedingAttention } from './jobs';
import { listTasks } from './tasks';
import { interviewsToday } from './interviews';
import { refreshOverdue } from './payments';
import { daysBetween, hoursBetween, startOfDay } from '../time';

export type ActionSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * What can be done about an action without leaving the page.
 *
 * A list that only links somewhere leaves the work exactly where it was — the recruiter
 * still has to find the screen, the record and the button. Naming the operation here lets
 * the item carry it, so the common case is one press and done.
 */
export type ActionOperation =
  | { type: 'complete_task'; taskId: string }
  | { type: 'message_candidate'; candidateId: string; phone: string; jobId: string | null; label: string }
  | { type: 'mark_paid'; paymentId: string }
  | { type: 'confirm_placement'; placementId: string }
  | { type: 'navigate' };

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
  /** The thing this row can do in place. 'navigate' when only a link makes sense. */
  operation: ActionOperation;
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
      operation: { type: 'navigate' },
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
      operation: { type: 'complete_task', taskId: task.id },
    });
  }

  // 3. Candidates who were contacted and never replied.
  const silent = db.all<{ candidate_id: string; name: string; last_sent: string; phone: string | null; job_id: string | null }>(
    `SELECT m.candidate_id, (c.first_name || ' ' || c.last_name) AS name, MAX(m.sent_at) AS last_sent,
            COALESCE(c.whatsapp, c.phone) AS phone,
            (SELECT a.job_id FROM applications a
              WHERE a.candidate_id = m.candidate_id AND a.org_id = m.org_id
              ORDER BY a.updated_at DESC LIMIT 1) AS job_id
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
      operation: candidate.phone
        ? {
            type: 'message_candidate',
            candidateId: candidate.candidate_id,
            phone: candidate.phone,
            jobId: candidate.job_id,
            label: 'שליחת מעקב',
          }
        : { type: 'navigate' },
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
      operation: { type: 'navigate' },
    });
  }

  // 5. Interviews happening today.
  const interviewContacts = new Map(
    db.all<{ id: string; phone: string | null }>(
      `SELECT i.id, COALESCE(c.whatsapp, c.phone) AS phone
         FROM interviews i JOIN candidates c ON c.id = i.candidate_id
        WHERE i.org_id = ? AND date(i.scheduled_at) = date('now')`,
      orgId,
    ).map((row) => [row.id, row.phone]),
  );
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
      operation: interviewContacts.get(interview.id)
        ? {
            type: 'message_candidate',
            candidateId: interview.candidate_id,
            phone: interviewContacts.get(interview.id)!,
            jobId: interview.job_id ?? null,
            label: 'אישור עם המועמד',
          }
        : { type: 'navigate' },
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
      operation: { type: 'mark_paid', paymentId: payment.id },
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
      operation: { type: 'confirm_placement', placementId: placement.id },
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
      operation: { type: 'navigate' },
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
