import { getDb } from '../db/index';
import { repos } from '../db/repos';
import { nowIso } from '../time';
import { emitEvent, EVENT_TYPES } from './events';
import { candidateName } from './candidates';
import { timeline } from './activity';
import { ApiError } from '../errors';
import type { ApplicationRow, StageRow } from '../types';

export interface PipelineCard {
  application_id: string;
  candidate_id: string;
  candidate_name: string;
  city: string | null;
  phone: string | null;
  current_role: string | null;
  stage_key: string;
  status: string;
  match_score: number | null;
  updated_at: string;
  days_in_stage: number;
  next_interview_at: string | null;
}

export function stagesFor(orgId: string): StageRow[] {
  return repos.stages.list(orgId, { orderBy: 'sort_order ASC' });
}

export function pipelineStages(orgId: string): StageRow[] {
  return stagesFor(orgId).filter((stage) => stage.in_pipeline === 1);
}

function stageOrThrow(orgId: string, key: string): StageRow {
  const stage = repos.stages.findBy(orgId, 'key = ?', key);
  if (!stage) throw new ApiError(400, `שלב לא קיים: ${key}`);
  return stage;
}

/** Adds a candidate to a job. Idempotent: an existing application is returned as-is. */
export function addCandidateToJob(
  orgId: string,
  userId: string,
  input: { candidate_id: string; job_id: string; stage_key?: string | null; source?: string | null; match_score?: number | null },
): ApplicationRow {
  const candidate = repos.candidates.find(orgId, input.candidate_id);
  const job = repos.jobs.find(orgId, input.job_id);
  if (!candidate) throw new ApiError(404, 'מועמד לא נמצא');
  if (!job) throw new ApiError(404, 'משרה לא נמצאה');

  const existing = repos.applications.findBy(
    orgId, 'candidate_id = ? AND job_id = ?', input.candidate_id, input.job_id,
  );
  if (existing) return existing;

  const stageKey = input.stage_key || 'new';
  stageOrThrow(orgId, stageKey);

  const application = repos.applications.create(orgId, {
    candidate_id: input.candidate_id,
    job_id: input.job_id,
    stage_key: stageKey,
    status: 'active',
    source: input.source ?? candidate.source ?? null,
    match_score: input.match_score ?? null,
    stage_changed_at: nowIso(),
  });

  emitEvent(orgId, {
    type: EVENT_TYPES.applicationCreated,
    candidateId: candidate.id,
    jobId: job.id,
    clientId: job.client_id,
    applicationId: application.id,
    actorUserId: userId,
    summary: `${candidateName(candidate)} שויך למשרה ${job.title}`,
    meta: { stage_key: stageKey, match_score: input.match_score ?? null },
  });
  return application;
}

export interface StageMoveResult {
  application: ApplicationRow;
  stage: StageRow;
}

/**
 * Moves an application between stages and keeps everything that depends on it in sync:
 * the candidate's own status, the sent-to-client clock, and the events automations listen to.
 */
export function moveApplicationStage(
  orgId: string,
  userId: string,
  applicationId: string,
  stageKey: string,
  reason?: string | null,
): StageMoveResult {
  const application = repos.applications.find(orgId, applicationId);
  if (!application) throw new ApiError(404, 'שיוך לא נמצא');
  const stage = stageOrThrow(orgId, stageKey);
  const candidate = repos.candidates.find(orgId, application.candidate_id);
  const job = repos.jobs.find(orgId, application.job_id);
  const previousStage = application.stage_key;

  const db = getDb();
  const updated = db.transaction(() => {
    const values: Record<string, string | number | null> = {
      stage_key: stageKey,
      stage_changed_at: nowIso(),
      status: stage.outcome === 'negative' ? 'rejected' : 'active',
    };
    if (stageKey === 'sent_to_client' && !application.sent_to_client_at) values.sent_to_client_at = nowIso();
    if (stageKey === 'client_interview' || stage.outcome === 'negative') values.client_feedback_at = nowIso();
    if (reason) values.rejected_reason = reason;

    const next = repos.applications.update(orgId, applicationId, values)!;
    // The candidate's headline status follows their furthest-along application.
    repos.candidates.update(orgId, application.candidate_id, {
      status_key: stageKey,
      last_contact_at: nowIso(),
    });
    return next;
  });

  const shared = {
    candidateId: application.candidate_id,
    jobId: application.job_id,
    clientId: job?.client_id ?? null,
    applicationId,
    actorUserId: userId,
    meta: { from: previousStage, to: stageKey, stage_key: stageKey, reason: reason ?? null },
  };

  emitEvent(orgId, {
    ...shared,
    type: EVENT_TYPES.applicationStageChanged,
    summary: `${candidateName(candidate)} — ${job?.title ?? ''}: ${stage.label}`,
  });

  if (stageKey === 'sent_to_client' && previousStage !== 'sent_to_client') {
    emitEvent(orgId, {
      ...shared,
      type: EVENT_TYPES.applicationSentToClient,
      summary: `${candidateName(candidate)} נשלח ללקוח עבור ${job?.title ?? ''}`,
    });
  }
  if (stage.outcome === 'negative') {
    emitEvent(orgId, {
      ...shared,
      type: EVENT_TYPES.applicationRejected,
      summary: `${candidateName(candidate)} — ${stage.label}${reason ? `: ${reason}` : ''}`,
    });
  }

  return { application: updated, stage };
}

export function removeApplication(orgId: string, applicationId: string): boolean {
  return repos.applications.remove(orgId, applicationId);
}

export function pipelineForJob(orgId: string, jobId: string): PipelineCard[] {
  return getDb().all<PipelineCard>(
    `SELECT a.id AS application_id, a.candidate_id,
            (c.first_name || ' ' || c.last_name) AS candidate_name,
            c.city, c.phone, c.current_role, a.stage_key, a.status, a.match_score, a.updated_at,
            CAST((julianday('now') - julianday(a.stage_changed_at)) AS INTEGER) AS days_in_stage,
            (SELECT i.scheduled_at FROM interviews i
              WHERE i.application_id = a.id AND i.status = 'scheduled'
              ORDER BY i.scheduled_at ASC LIMIT 1) AS next_interview_at
       FROM applications a
       JOIN candidates c ON c.id = a.candidate_id
      WHERE a.org_id = ? AND a.job_id = ?
      ORDER BY a.match_score DESC NULLS LAST, a.updated_at DESC`,
    orgId, jobId,
  );
}

/** Board across every open job — the "all my candidates in flight" view. */
export function pipelineOverview(orgId: string): PipelineCard[] {
  return getDb().all<PipelineCard>(
    `SELECT a.id AS application_id, a.candidate_id,
            (c.first_name || ' ' || c.last_name) AS candidate_name,
            c.city, c.phone, c.current_role, a.stage_key, a.status, a.match_score, a.updated_at,
            CAST((julianday('now') - julianday(a.stage_changed_at)) AS INTEGER) AS days_in_stage,
            NULL AS next_interview_at
       FROM applications a
       JOIN candidates c ON c.id = a.candidate_id
       JOIN jobs j ON j.id = a.job_id
      WHERE a.org_id = ? AND a.status = 'active' AND j.status IN ('open','sourcing')
      ORDER BY a.updated_at DESC
      LIMIT 400`,
    orgId,
  );
}

export interface ApplicationDetail {
  application: ApplicationRow;
  candidate_name: string;
  job_title: string;
  client_name: string | null;
  timeline: ReturnType<typeof timeline>;
}

export function getApplicationDetail(orgId: string, applicationId: string): ApplicationDetail | null {
  const row = getDb().get<ApplicationRow & { candidate_name: string; job_title: string; client_name: string | null }>(
    `SELECT a.*, (c.first_name || ' ' || c.last_name) AS candidate_name, j.title AS job_title, cl.name AS client_name
       FROM applications a
       JOIN candidates c ON c.id = a.candidate_id
       JOIN jobs j ON j.id = a.job_id
  LEFT JOIN clients cl ON cl.id = j.client_id
      WHERE a.org_id = ? AND a.id = ?`,
    orgId, applicationId,
  );
  if (!row) return null;
  const { candidate_name, job_title, client_name, ...application } = row;
  return {
    application: application as ApplicationRow,
    candidate_name,
    job_title,
    client_name,
    timeline: timeline(orgId, { applicationId, limit: 40 }),
  };
}
