import { getDb } from '../db/index';
import { repos } from '../db/repos';
import { endOfDay, nowIso, startOfDay } from '../time';
import { emitEvent, EVENT_TYPES } from './events';
import type { TaskInput } from '../schemas';
import type { TaskRow } from '../types';

export interface TaskListItem extends TaskRow {
  candidate_name: string | null;
  client_name: string | null;
  job_title: string | null;
  is_overdue: number;
}

const LIST_SQL = `
  SELECT t.*,
         CASE WHEN c.id IS NULL THEN NULL ELSE (c.first_name || ' ' || c.last_name) END AS candidate_name,
         cl.name AS client_name,
         j.title AS job_title,
         CASE WHEN t.status = 'open' AND t.due_at IS NOT NULL AND t.due_at < ? THEN 1 ELSE 0 END AS is_overdue
    FROM tasks t
    LEFT JOIN candidates c ON c.id = t.candidate_id
    LEFT JOIN clients cl ON cl.id = t.client_id
    LEFT JOIN jobs j ON j.id = t.job_id`;

export interface TaskFilters {
  status?: 'open' | 'done' | 'cancelled' | 'all';
  scope?: 'today' | 'overdue' | 'week' | 'all';
  candidateId?: string;
  clientId?: string;
  jobId?: string;
  limit?: number;
}

export function listTasks(orgId: string, filters: TaskFilters = {}): TaskListItem[] {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  const status = filters.status ?? 'open';
  if (status !== 'all') {
    clauses.push('t.status = ?');
    params.push(status);
  }
  if (filters.scope === 'today') {
    clauses.push('t.due_at <= ?');
    params.push(endOfDay());
  }
  if (filters.scope === 'overdue') {
    clauses.push('t.due_at < ?');
    params.push(startOfDay());
  }
  if (filters.scope === 'week') {
    clauses.push('t.due_at <= ?');
    params.push(endOfDay(new Date(Date.now() + 7 * 86_400_000)));
  }
  for (const [key, column] of [['candidateId', 't.candidate_id'], ['clientId', 't.client_id'], ['jobId', 't.job_id']] as const) {
    const value = filters[key];
    if (value) {
      clauses.push(`${column} = ?`);
      params.push(value);
    }
  }

  return getDb().all<TaskListItem>(
    `${LIST_SQL} WHERE t.org_id = ? ${clauses.length ? `AND ${clauses.join(' AND ')}` : ''}
      ORDER BY t.status = 'done', t.due_at IS NULL, t.due_at ASC,
               CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END
      LIMIT ?`,
    nowIso(), orgId, ...params, filters.limit ?? 100,
  );
}

export function createTask(orgId: string, userId: string, input: TaskInput): TaskRow {
  const task = repos.tasks.create(orgId, {
    title: input.title,
    details: input.details ?? null,
    due_at: input.due_at ?? null,
    remind_at: input.remind_at ?? null,
    priority: input.priority ?? 'normal',
    status: 'open',
    candidate_id: input.candidate_id ?? null,
    client_id: input.client_id ?? null,
    job_id: input.job_id ?? null,
    application_id: input.application_id ?? null,
    created_by: 'user',
  });

  emitEvent(orgId, {
    type: EVENT_TYPES.taskCreated,
    candidateId: task.candidate_id,
    clientId: task.client_id,
    jobId: task.job_id,
    applicationId: task.application_id,
    actorUserId: userId,
    summary: `נוצרה משימה: ${task.title}`,
  });
  return task;
}

export function updateTask(
  orgId: string,
  userId: string,
  taskId: string,
  input: Partial<TaskInput>,
): TaskRow | undefined {
  const before = repos.tasks.find(orgId, taskId);
  if (!before) return undefined;

  const values: Record<string, string | number | null> = { ...input } as Record<string, string | number | null>;
  if (input.status === 'done' && before.status !== 'done') values.completed_at = nowIso();
  if (input.status === 'open') values.completed_at = null;

  const task = repos.tasks.update(orgId, taskId, values)!;

  if (input.status === 'done' && before.status !== 'done') {
    emitEvent(orgId, {
      type: EVENT_TYPES.taskCompleted,
      candidateId: task.candidate_id,
      clientId: task.client_id,
      jobId: task.job_id,
      actorUserId: userId,
      summary: `הושלמה משימה: ${task.title}`,
    });
  }
  return task;
}

export function deleteTask(orgId: string, taskId: string): boolean {
  return repos.tasks.remove(orgId, taskId);
}

export function taskCounts(orgId: string) {
  const row = getDb().get<{ open: number; today: number; overdue: number }>(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'open') AS open,
       COUNT(*) FILTER (WHERE status = 'open' AND due_at IS NOT NULL AND due_at <= ?) AS today,
       COUNT(*) FILTER (WHERE status = 'open' AND due_at IS NOT NULL AND due_at < ?) AS overdue
     FROM tasks WHERE org_id = ?`,
    endOfDay(), startOfDay(), orgId,
  );
  return { open: row?.open ?? 0, today: row?.today ?? 0, overdue: row?.overdue ?? 0 };
}
