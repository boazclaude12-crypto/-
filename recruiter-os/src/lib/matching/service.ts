import { getDb } from '../db/index';
import { repos } from '../db/repos';
import { candidateIdsOnJob } from '../domain/candidates';
import { ACTIVE_JOB_STATUSES } from '../domain/constants';
import { rankCandidates, scoreMatch, type MatchCandidate, type MatchJob, type MatchResult } from './engine';

interface AttributeRow {
  candidate_id: string;
  kind: string;
  value: string;
  value_norm: string;
}

/** Loads attributes and past job titles for a set of candidates in two queries. */
function enrich(orgId: string, candidates: Array<Omit<MatchCandidate, 'attributes' | 'experience_titles'>>): MatchCandidate[] {
  if (candidates.length === 0) return [];
  const db = getDb();
  const ids = candidates.map((c) => c.id);
  const placeholders = ids.map(() => '?').join(', ');

  const attributes = db.all<AttributeRow>(
    `SELECT candidate_id, kind, value, value_norm FROM candidate_attributes
      WHERE org_id = ? AND candidate_id IN (${placeholders})`,
    orgId, ...ids,
  );
  const titles = db.all<{ candidate_id: string; title: string }>(
    `SELECT candidate_id, title FROM candidate_experiences
      WHERE org_id = ? AND candidate_id IN (${placeholders})`,
    orgId, ...ids,
  );

  const byCandidate = new Map<string, { attributes: AttributeRow[]; titles: string[] }>();
  for (const id of ids) byCandidate.set(id, { attributes: [], titles: [] });
  for (const row of attributes) byCandidate.get(row.candidate_id)?.attributes.push(row);
  for (const row of titles) byCandidate.get(row.candidate_id)?.titles.push(row.title);

  return candidates.map((candidate) => ({
    ...candidate,
    attributes: byCandidate.get(candidate.id)?.attributes ?? [],
    experience_titles: byCandidate.get(candidate.id)?.titles ?? [],
  }));
}

const CANDIDATE_COLUMNS = `id, first_name, last_name, city, region, current_role, years_experience,
  desired_salary, current_salary, availability, employment_type, education, search_text,
  max_commute_km, has_car, willing_to_relocate`;

export function loadCandidatePool(orgId: string, limit = 800): MatchCandidate[] {
  const rows = getDb().all<Omit<MatchCandidate, 'attributes' | 'experience_titles'>>(
    `SELECT ${CANDIDATE_COLUMNS} FROM candidates
      WHERE org_id = ? AND status_key NOT IN ('irrelevant','not_interested')
      ORDER BY updated_at DESC LIMIT ?`,
    orgId, limit,
  );
  return enrich(orgId, rows);
}

export function loadCandidateForMatching(orgId: string, candidateId: string): MatchCandidate | null {
  const row = getDb().get<Omit<MatchCandidate, 'attributes' | 'experience_titles'>>(
    `SELECT ${CANDIDATE_COLUMNS} FROM candidates WHERE org_id = ? AND id = ?`,
    orgId, candidateId,
  );
  if (!row) return null;
  return enrich(orgId, [row])[0]!;
}

export function loadJobForMatching(orgId: string, jobId: string): MatchJob | null {
  const job = repos.jobs.find(orgId, jobId);
  if (!job) return null;
  return {
    id: job.id,
    title: job.title,
    city: job.city,
    region: job.region,
    salary_min: job.salary_min,
    salary_max: job.salary_max,
    salary_period: job.salary_period,
    employment_type: job.employment_type,
    description: job.description,
    work_mode: job.work_mode ?? 'onsite',
    requirements: repos.jobRequirements.list(orgId, { where: 'job_id = ?', params: [jobId] }),
  };
}

export interface CandidateMatch extends MatchResult {
  candidate: {
    id: string; name: string; city: string | null; current_role: string | null;
    phone: string | null; desired_salary: number | null; availability: string | null;
  };
  alreadyOnJob: boolean;
}

/** Ranked shortlist for a job, with the candidates already in its pipeline flagged. */
export function matchCandidatesForJob(
  orgId: string,
  jobId: string,
  options: { minScore?: number; limit?: number; excludeExisting?: boolean } = {},
): CandidateMatch[] {
  const job = loadJobForMatching(orgId, jobId);
  if (!job) return [];

  const existing = candidateIdsOnJob(orgId, jobId);
  let pool = loadCandidatePool(orgId);
  if (options.excludeExisting) pool = pool.filter((c) => !existing.has(c.id));

  const ranked = rankCandidates(pool, job, { minScore: options.minScore, limit: options.limit ?? 20 });
  const byId = new Map(pool.map((c) => [c.id, c]));

  return ranked.map((result) => {
    const candidate = byId.get(result.candidateId)!;
    return {
      ...result,
      candidate: {
        id: candidate.id,
        name: `${candidate.first_name} ${candidate.last_name}`.trim(),
        city: candidate.city,
        current_role: candidate.current_role,
        phone: null,
        desired_salary: candidate.desired_salary,
        availability: candidate.availability,
      },
      alreadyOnJob: existing.has(candidate.id),
    };
  });
}

export interface JobMatch extends MatchResult {
  job: { id: string; title: string; client_name: string | null; city: string | null; status: string };
  alreadyApplied: boolean;
}

/** The reverse view: which open jobs suit this candidate. */
export function matchJobsForCandidate(
  orgId: string,
  candidateId: string,
  options: { minScore?: number; limit?: number } = {},
): JobMatch[] {
  const candidate = loadCandidateForMatching(orgId, candidateId);
  if (!candidate) return [];

  const db = getDb();
  const jobs = db.all<{ id: string; title: string; client_name: string | null; status: string }>(
    `SELECT j.id, j.title, j.status, c.name AS client_name
       FROM jobs j LEFT JOIN clients c ON c.id = j.client_id
      WHERE j.org_id = ? AND j.status IN (${ACTIVE_JOB_STATUSES.map(() => '?').join(', ')})
      ORDER BY j.updated_at DESC LIMIT 200`,
    orgId, ...ACTIVE_JOB_STATUSES,
  );

  const applied = new Set(
    db.all<{ job_id: string }>('SELECT job_id FROM applications WHERE org_id = ? AND candidate_id = ?', orgId, candidateId)
      .map((r) => r.job_id),
  );

  const results: JobMatch[] = [];
  for (const summary of jobs) {
    const job = loadJobForMatching(orgId, summary.id);
    if (!job) continue;
    const result = scoreMatch(candidate, job);
    if (result.score < (options.minScore ?? 0)) continue;
    results.push({
      ...result,
      job: { id: job.id, title: job.title, client_name: summary.client_name, city: job.city, status: summary.status },
      alreadyApplied: applied.has(job.id),
    });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, options.limit ?? 10);
}
