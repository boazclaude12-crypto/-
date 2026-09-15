import { getDb } from '../db/index';
import { repos } from '../db/repos';
import { endOfDay, startOfDay } from '../time';
import { emitEvent, EVENT_TYPES } from './events';
import { candidateName } from './candidates';
import { ApiError } from '../errors';
import type { InterviewRow } from '../types';
import type { z } from 'zod';
import type { interviewSchema } from '../schemas';

type InterviewInput = z.infer<typeof interviewSchema>;

export interface InterviewListItem extends InterviewRow {
  candidate_name: string;
  job_title: string | null;
  client_name: string | null;
}

const LIST_SQL = `
  SELECT i.*, (c.first_name || ' ' || c.last_name) AS candidate_name,
         j.title AS job_title, cl.name AS client_name
    FROM interviews i
    JOIN candidates c ON c.id = i.candidate_id
    LEFT JOIN jobs j ON j.id = i.job_id
    LEFT JOIN clients cl ON cl.id = j.client_id`;

export function listInterviews(
  orgId: string,
  filters: { from?: string; to?: string; status?: string; candidateId?: string; jobId?: string; limit?: number } = {},
): InterviewListItem[] {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (filters.from) {
    clauses.push('i.scheduled_at >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    clauses.push('i.scheduled_at <= ?');
    params.push(filters.to);
  }
  if (filters.status) {
    clauses.push('i.status = ?');
    params.push(filters.status);
  }
  if (filters.candidateId) {
    clauses.push('i.candidate_id = ?');
    params.push(filters.candidateId);
  }
  if (filters.jobId) {
    clauses.push('i.job_id = ?');
    params.push(filters.jobId);
  }
  return getDb().all<InterviewListItem>(
    `${LIST_SQL} WHERE i.org_id = ? ${clauses.length ? `AND ${clauses.join(' AND ')}` : ''}
      ORDER BY i.scheduled_at ASC LIMIT ?`,
    orgId, ...params, filters.limit ?? 100,
  );
}

export const interviewsToday = (orgId: string) =>
  listInterviews(orgId, { from: startOfDay(), to: endOfDay(), status: 'scheduled' });

export function scheduleInterview(orgId: string, userId: string, input: InterviewInput): InterviewRow {
  const candidate = repos.candidates.find(orgId, input.candidate_id);
  if (!candidate) throw new ApiError(404, 'מועמד לא נמצא');
  const job = input.job_id ? repos.jobs.find(orgId, input.job_id) : undefined;

  const interview = repos.interviews.create(orgId, {
    application_id: input.application_id ?? null,
    candidate_id: input.candidate_id,
    job_id: job?.id ?? null,
    kind: input.kind ?? 'recruiter',
    scheduled_at: input.scheduled_at,
    duration_minutes: input.duration_minutes ?? 45,
    location: input.location ?? null,
    interviewer: input.interviewer ?? null,
    status: 'scheduled',
  });

  emitEvent(orgId, {
    type: EVENT_TYPES.interviewScheduled,
    candidateId: candidate.id,
    jobId: job?.id ?? null,
    clientId: job?.client_id ?? null,
    applicationId: input.application_id ?? null,
    actorUserId: userId,
    summary: `נקבע ראיון ל${candidateName(candidate)}${job ? ` — ${job.title}` : ''}`,
    meta: { kind: interview.kind, scheduled_at: interview.scheduled_at },
  });
  return interview;
}

export function updateInterview(
  orgId: string,
  userId: string,
  interviewId: string,
  input: Partial<InterviewInput>,
): InterviewRow | undefined {
  const before = repos.interviews.find(orgId, interviewId);
  if (!before) return undefined;
  const interview = repos.interviews.update(orgId, interviewId, input as Record<string, string | number | null>)!;

  if (input.status === 'completed' && before.status !== 'completed') {
    const candidate = repos.candidates.find(orgId, interview.candidate_id);
    emitEvent(orgId, {
      type: EVENT_TYPES.interviewCompleted,
      candidateId: interview.candidate_id,
      jobId: interview.job_id,
      applicationId: interview.application_id,
      actorUserId: userId,
      summary: `הראיון עם ${candidateName(candidate)} הסתיים${interview.outcome ? ` — ${interview.outcome}` : ''}`,
      meta: { outcome: interview.outcome },
    });
  }
  return interview;
}

export function cancelInterview(orgId: string, interviewId: string): boolean {
  return repos.interviews.update(orgId, interviewId, { status: 'cancelled' }) !== undefined;
}
