import { repos } from '../db/repos';
import type { ActivityEventRow } from '../types';

export interface ActivityRefs {
  candidateId?: string | null;
  clientId?: string | null;
  jobId?: string | null;
  applicationId?: string | null;
  placementId?: string | null;
}

export interface ActivityInput extends ActivityRefs {
  type: string;
  summary: string;
  actor?: 'user' | 'system' | 'automation';
  actorUserId?: string | null;
  meta?: Record<string, unknown>;
}

/**
 * Appends one entry to the timeline. Deliberately side-effect free beyond the insert:
 * `emitEvent` is the entry point that also runs automations.
 */
export function logActivity(orgId: string, input: ActivityInput): ActivityEventRow {
  return repos.activity.create(orgId, {
    type: input.type,
    actor: input.actor ?? 'user',
    actor_user_id: input.actorUserId ?? null,
    candidate_id: input.candidateId ?? null,
    client_id: input.clientId ?? null,
    job_id: input.jobId ?? null,
    application_id: input.applicationId ?? null,
    placement_id: input.placementId ?? null,
    summary: input.summary,
    meta: JSON.stringify(input.meta ?? {}),
  });
}

export interface TimelineQuery extends ActivityRefs {
  limit?: number;
  types?: string[];
}

export function timeline(orgId: string, query: TimelineQuery = {}): ActivityEventRow[] {
  const clauses: string[] = [];
  const params: string[] = [];
  const refs: Array<[keyof ActivityRefs, string]> = [
    ['candidateId', 'candidate_id'],
    ['clientId', 'client_id'],
    ['jobId', 'job_id'],
    ['applicationId', 'application_id'],
    ['placementId', 'placement_id'],
  ];
  for (const [key, column] of refs) {
    const value = query[key];
    if (value) {
      clauses.push(`${column} = ?`);
      params.push(value);
    }
  }
  if (query.types?.length) {
    clauses.push(`type IN (${query.types.map(() => '?').join(', ')})`);
    params.push(...query.types);
  }
  return repos.activity.list(orgId, {
    where: clauses.length ? clauses.join(' AND ') : undefined,
    params,
    orderBy: 'created_at DESC, rowid DESC',
    limit: query.limit ?? 50,
  });
}
