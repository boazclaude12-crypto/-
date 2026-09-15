import { getDb } from '../db/index';
import { repos } from '../db/repos';
import { canonical, normalize } from '../text';
import { regionOfCity } from '../geo';
import { nowIso } from '../time';
import { emitEvent, EVENT_TYPES } from './events';
import { jobTags, setJobTags } from './tags';
import { timeline } from './activity';
import { ACTIVE_JOB_STATUSES } from './constants';
import type { JobInput } from '../schemas';
import type { JobRequirementRow, JobRow, TagRow } from '../types';

export interface JobFilters {
  q?: string;
  status?: string;
  clientId?: string;
  priority?: string;
  tag?: string;
  activeOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface JobListItem extends JobRow {
  client_name: string | null;
  active_candidates: number;
  sent_to_client: number;
  placed: number;
  days_open: number;
}

function buildSearchText(job: Partial<JobRow>, requirements: Array<{ value: string }>, tags: string[]): string {
  return normalize(
    [job.title, job.city, job.region, job.description, job.benefits, job.hours,
      ...requirements.map((r) => r.value), ...tags].filter(Boolean).join(' '),
  );
}

function refreshSearchText(orgId: string, jobId: string): void {
  const job = repos.jobs.find(orgId, jobId);
  if (!job) return;
  const requirements = repos.jobRequirements.list(orgId, { where: 'job_id = ?', params: [jobId] });
  const tags = jobTags(orgId, jobId).map((t) => t.name);
  getDb().run(
    'UPDATE jobs SET search_text = ? WHERE id = ? AND org_id = ?',
    buildSearchText(job, requirements, tags), jobId, orgId,
  );
}

function writeRequirements(orgId: string, jobId: string, requirements: JobInput['requirements']): void {
  if (!requirements) return;
  repos.jobRequirements.removeBy(orgId, 'job_id = ?', jobId);
  for (const requirement of requirements) {
    if (!requirement.value.trim()) continue;
    repos.jobRequirements.create(orgId, {
      job_id: jobId,
      kind: requirement.kind,
      value: requirement.value.trim(),
      value_norm: canonical(requirement.value),
      is_required: requirement.is_required === false ? 0 : 1,
      weight: requirement.weight ?? 1,
    });
  }
}

function scalarFields(input: Partial<JobInput>) {
  const { requirements, tags, ...rest } = input;
  void requirements;
  void tags;
  const values: Record<string, string | number | null> = { ...rest } as Record<string, string | number | null>;
  if (typeof values.city === 'string' && !values.region) values.region = regionOfCity(values.city);
  return values;
}

export function createJob(orgId: string, userId: string, input: JobInput): JobRow {
  const client = input.client_id ? repos.clients.find(orgId, input.client_id) : undefined;
  const db = getDb();

  const job = db.transaction(() => {
    const created = repos.jobs.create(orgId, {
      ...scalarFields(input),
      client_id: client?.id ?? null,
      opened_at: nowIso(),
      fee_type: input.fee_type ?? client?.fee_type ?? 'percent',
      fee_value: input.fee_value ?? client?.fee_value ?? 12,
    });
    writeRequirements(orgId, created.id, input.requirements);
    if (input.tags) setJobTags(orgId, created.id, input.tags);
    refreshSearchText(orgId, created.id);
    return repos.jobs.find(orgId, created.id)!;
  });

  emitEvent(orgId, {
    type: EVENT_TYPES.jobCreated,
    jobId: job.id,
    clientId: job.client_id,
    actorUserId: userId,
    summary: `נפתחה משרה: ${job.title}`,
    meta: { priority: job.priority },
  });
  return job;
}

export function updateJob(
  orgId: string,
  userId: string,
  jobId: string,
  input: Partial<JobInput>,
): JobRow | undefined {
  const before = repos.jobs.find(orgId, jobId);
  if (!before) return undefined;

  const db = getDb();
  const after = db.transaction(() => {
    const values = scalarFields(input);
    if (input.status === 'closed' && before.status !== 'closed') values.closed_at = nowIso();
    if (input.status && input.status !== 'closed') values.closed_at = null;
    repos.jobs.update(orgId, jobId, values);
    if (input.requirements) writeRequirements(orgId, jobId, input.requirements);
    if (input.tags) setJobTags(orgId, jobId, input.tags);
    refreshSearchText(orgId, jobId);
    return repos.jobs.find(orgId, jobId)!;
  });

  if (input.status === 'closed' && before.status !== 'closed') {
    emitEvent(orgId, {
      type: EVENT_TYPES.jobClosed,
      jobId,
      clientId: after.client_id,
      actorUserId: userId,
      summary: `המשרה נסגרה: ${after.title}`,
    });
  } else {
    emitEvent(orgId, {
      type: 'job.updated',
      jobId,
      clientId: after.client_id,
      actorUserId: userId,
      summary: 'פרטי המשרה עודכנו',
    });
  }
  return after;
}

export function deleteJob(orgId: string, jobId: string): boolean {
  return repos.jobs.remove(orgId, jobId);
}

export function listJobs(orgId: string, filters: JobFilters = {}): JobListItem[] {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (filters.q) {
    for (const term of normalize(filters.q).split(' ').filter(Boolean)) {
      clauses.push('j.search_text LIKE ?');
      params.push(`%${term}%`);
    }
  }
  if (filters.status) {
    clauses.push('j.status = ?');
    params.push(filters.status);
  }
  if (filters.activeOnly) {
    clauses.push(`j.status IN (${ACTIVE_JOB_STATUSES.map(() => '?').join(', ')})`);
    params.push(...ACTIVE_JOB_STATUSES);
  }
  if (filters.clientId) {
    clauses.push('j.client_id = ?');
    params.push(filters.clientId);
  }
  if (filters.priority) {
    clauses.push('j.priority = ?');
    params.push(filters.priority);
  }
  if (filters.tag) {
    clauses.push('EXISTS (SELECT 1 FROM job_tags jt JOIN tags t ON t.id = jt.tag_id WHERE jt.job_id = j.id AND t.name = ?)');
    params.push(filters.tag);
  }

  return getDb().all<JobListItem>(
    `SELECT j.*, c.name AS client_name,
            (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id AND a.status = 'active') AS active_candidates,
            (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id AND a.sent_to_client_at IS NOT NULL) AS sent_to_client,
            (SELECT COUNT(*) FROM placements p WHERE p.job_id = j.id AND p.status != 'fallen_through') AS placed,
            CAST((julianday('now') - julianday(j.opened_at)) AS INTEGER) AS days_open
       FROM jobs j
  LEFT JOIN clients c ON c.id = j.client_id
      WHERE j.org_id = ? ${clauses.length ? `AND ${clauses.join(' AND ')}` : ''}
      ORDER BY CASE j.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
               j.updated_at DESC
      LIMIT ? OFFSET ?`,
    orgId, ...params, filters.limit ?? 50, filters.offset ?? 0,
  );
}

export interface JobDetail {
  job: JobListItem;
  requirements: JobRequirementRow[];
  tags: TagRow[];
  timeline: ReturnType<typeof timeline>;
}

export function getJobDetail(orgId: string, jobId: string): JobDetail | null {
  const job = getDb().get<JobListItem>(
    `SELECT j.*, c.name AS client_name,
            (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id AND a.status = 'active') AS active_candidates,
            (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id AND a.sent_to_client_at IS NOT NULL) AS sent_to_client,
            (SELECT COUNT(*) FROM placements p WHERE p.job_id = j.id AND p.status != 'fallen_through') AS placed,
            CAST((julianday('now') - julianday(j.opened_at)) AS INTEGER) AS days_open
       FROM jobs j
  LEFT JOIN clients c ON c.id = j.client_id
      WHERE j.org_id = ? AND j.id = ?`,
    orgId, jobId,
  );
  if (!job) return null;

  return {
    job,
    requirements: repos.jobRequirements.list(orgId, {
      where: 'job_id = ?', params: [jobId], orderBy: 'is_required DESC, kind',
    }),
    tags: jobTags(orgId, jobId),
    timeline: timeline(orgId, { jobId, limit: 60 }),
  };
}

export function jobsNeedingAttention(orgId: string, minDays = 14, maxCandidates = 3): JobListItem[] {
  return listJobs(orgId, { activeOnly: true, limit: 100 }).filter(
    (job) => job.days_open >= minDays && job.active_candidates <= maxCandidates,
  );
}
