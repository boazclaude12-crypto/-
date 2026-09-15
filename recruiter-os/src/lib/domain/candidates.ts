import { getDb } from '../db/index';
import { repos } from '../db/repos';
import { canonical, normalize, normalizePhone } from '../text';
import { regionOfCity } from '../geo';
import { nowIso } from '../time';
import { emitEvent, EVENT_TYPES } from './events';
import { candidateTags, setCandidateTags } from './tags';
import { timeline } from './activity';
import type { CandidateInput } from '../schemas';
import type {
  CandidateAttributeRow, CandidateDocumentRow, CandidateExperienceRow, CandidateRow, TagRow,
} from '../types';

export interface CandidateFilters {
  q?: string;
  status?: string;
  city?: string;
  region?: string;
  availability?: string;
  tag?: string;
  jobId?: string;
  sort?: 'recent' | 'name' | 'created';
  limit?: number;
  offset?: number;
}

export interface CandidateListItem extends CandidateRow {
  tag_names: string | null;
  open_applications: number;
}

function fullName(candidate: { first_name: string; last_name: string }): string {
  return `${candidate.first_name} ${candidate.last_name}`.trim();
}

export function candidateName(candidate: { first_name: string; last_name: string } | undefined | null): string {
  return candidate ? fullName(candidate) : 'מועמד לא ידוע';
}

/**
 * One denormalised column powers global search. It is rebuilt on every write so it
 * can never drift from the relational data it summarises.
 */
function buildSearchText(
  candidate: Partial<CandidateRow>,
  attributes: Array<{ value: string }>,
  tags: string[],
): string {
  const parts = [
    candidate.first_name, candidate.last_name, candidate.phone, normalizePhone(candidate.phone),
    candidate.email, candidate.city, candidate.region, candidate.current_role, candidate.education,
    candidate.notes, ...attributes.map((a) => a.value), ...tags,
  ];
  return normalize(parts.filter(Boolean).join(' '));
}

function refreshSearchText(orgId: string, candidateId: string): void {
  const candidate = repos.candidates.find(orgId, candidateId);
  if (!candidate) return;
  const attributes = repos.candidateAttributes.list(orgId, {
    where: 'candidate_id = ?', params: [candidateId],
  });
  const tags = candidateTags(orgId, candidateId).map((t) => t.name);
  getDb().run(
    'UPDATE candidates SET search_text = ? WHERE id = ? AND org_id = ?',
    buildSearchText(candidate, attributes, tags), candidateId, orgId,
  );
}

function writeAttributes(orgId: string, candidateId: string, attributes: CandidateInput['attributes']): void {
  if (!attributes) return;
  repos.candidateAttributes.removeBy(orgId, 'candidate_id = ?', candidateId);
  for (const attribute of attributes) {
    if (!attribute.value.trim()) continue;
    repos.candidateAttributes.create(orgId, {
      candidate_id: candidateId,
      kind: attribute.kind,
      value: attribute.value.trim(),
      value_norm: canonical(attribute.value),
    });
  }
}

function writeExperiences(orgId: string, candidateId: string, experiences: CandidateInput['experiences']): void {
  if (!experiences) return;
  repos.candidateExperiences.removeBy(orgId, 'candidate_id = ?', candidateId);
  experiences.forEach((experience, index) => {
    repos.candidateExperiences.create(orgId, {
      candidate_id: candidateId,
      company: experience.company,
      title: experience.title,
      start_date: experience.start_date ?? null,
      end_date: experience.end_date ?? null,
      is_current: experience.is_current ? 1 : 0,
      description: experience.description ?? null,
      sort_order: index,
    });
  });
}

function scalarFields(input: Partial<CandidateInput>) {
  const { attributes, experiences, tags, ...rest } = input;
  void attributes;
  void experiences;
  void tags;
  const values: Record<string, string | number | null> = { ...rest } as Record<string, string | number | null>;
  if (typeof values.phone === 'string') values.phone = normalizePhone(values.phone);
  if (typeof values.whatsapp === 'string') values.whatsapp = normalizePhone(values.whatsapp);
  if (!values.whatsapp && typeof values.phone === 'string') values.whatsapp = values.phone;
  if (typeof values.city === 'string' && !values.region) values.region = regionOfCity(values.city);
  return values;
}

export function createCandidate(orgId: string, userId: string, input: CandidateInput): CandidateRow {
  const db = getDb();
  const candidate = db.transaction(() => {
    const created = repos.candidates.create(orgId, {
      ...scalarFields(input),
      status_key: input.status_key || 'new',
    });
    writeAttributes(orgId, created.id, input.attributes);
    writeExperiences(orgId, created.id, input.experiences);
    if (input.tags) setCandidateTags(orgId, created.id, input.tags);
    refreshSearchText(orgId, created.id);
    return repos.candidates.find(orgId, created.id)!;
  });

  emitEvent(orgId, {
    type: EVENT_TYPES.candidateCreated,
    candidateId: candidate.id,
    actorUserId: userId,
    summary: `מועמד נוסף למאגר: ${fullName(candidate)}`,
    meta: { source: candidate.source },
  });
  return candidate;
}

export function updateCandidate(
  orgId: string,
  userId: string,
  candidateId: string,
  input: Partial<CandidateInput>,
): CandidateRow | undefined {
  const before = repos.candidates.find(orgId, candidateId);
  if (!before) return undefined;

  const db = getDb();
  const after = db.transaction(() => {
    repos.candidates.update(orgId, candidateId, scalarFields(input));
    if (input.attributes) writeAttributes(orgId, candidateId, input.attributes);
    if (input.experiences) writeExperiences(orgId, candidateId, input.experiences);
    if (input.tags) setCandidateTags(orgId, candidateId, input.tags);
    refreshSearchText(orgId, candidateId);
    return repos.candidates.find(orgId, candidateId)!;
  });

  if (input.status_key && input.status_key !== before.status_key) {
    const stage = repos.stages.findBy(orgId, 'key = ?', after.status_key);
    emitEvent(orgId, {
      type: EVENT_TYPES.candidateStatusChanged,
      candidateId,
      actorUserId: userId,
      summary: `סטטוס עודכן ל"${stage?.label ?? after.status_key}"`,
      meta: { from: before.status_key, to: after.status_key, stage_key: after.status_key },
    });
  } else {
    emitEvent(orgId, {
      type: EVENT_TYPES.candidateUpdated,
      candidateId,
      actorUserId: userId,
      summary: 'פרטי המועמד עודכנו',
    });
  }
  return after;
}

export function deleteCandidate(orgId: string, candidateId: string): boolean {
  return repos.candidates.remove(orgId, candidateId);
}

export function markContacted(orgId: string, candidateId: string): void {
  getDb().run(
    'UPDATE candidates SET last_contact_at = ? WHERE id = ? AND org_id = ?',
    nowIso(), candidateId, orgId,
  );
}

export function listCandidates(orgId: string, filters: CandidateFilters = {}): CandidateListItem[] {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (filters.q) {
    const terms = normalize(filters.q).split(' ').filter(Boolean);
    for (const term of terms) {
      clauses.push('c.search_text LIKE ?');
      params.push(`%${term}%`);
    }
  }
  if (filters.status) {
    clauses.push('c.status_key = ?');
    params.push(filters.status);
  }
  if (filters.city) {
    clauses.push('c.city = ?');
    params.push(filters.city);
  }
  if (filters.region) {
    clauses.push('c.region = ?');
    params.push(filters.region);
  }
  if (filters.availability) {
    clauses.push('c.availability = ?');
    params.push(filters.availability);
  }
  if (filters.tag) {
    clauses.push('EXISTS (SELECT 1 FROM candidate_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.candidate_id = c.id AND t.name = ?)');
    params.push(filters.tag);
  }
  if (filters.jobId) {
    clauses.push('EXISTS (SELECT 1 FROM applications a WHERE a.candidate_id = c.id AND a.job_id = ?)');
    params.push(filters.jobId);
  }

  const order =
    filters.sort === 'name' ? 'c.first_name ASC, c.last_name ASC'
    : filters.sort === 'created' ? 'c.created_at DESC'
    : 'c.updated_at DESC';

  return getDb().all<CandidateListItem>(
    `SELECT c.*,
            (SELECT GROUP_CONCAT(t.name, ',') FROM candidate_tags ct JOIN tags t ON t.id = ct.tag_id
              WHERE ct.candidate_id = c.id) AS tag_names,
            (SELECT COUNT(*) FROM applications a WHERE a.candidate_id = c.id AND a.status = 'active') AS open_applications
       FROM candidates c
      WHERE c.org_id = ? ${clauses.length ? `AND ${clauses.join(' AND ')}` : ''}
      ORDER BY ${order}
      LIMIT ? OFFSET ?`,
    orgId, ...params, filters.limit ?? 50, filters.offset ?? 0,
  );
}

export function countCandidates(orgId: string, filters: CandidateFilters = {}): number {
  const rows = listCandidates(orgId, { ...filters, limit: 200, offset: 0 });
  return rows.length;
}

export interface CandidateDetail {
  candidate: CandidateRow;
  attributes: CandidateAttributeRow[];
  experiences: CandidateExperienceRow[];
  documents: CandidateDocumentRow[];
  tags: TagRow[];
  applications: Array<{
    id: string; job_id: string; job_title: string; client_name: string | null;
    stage_key: string; status: string; match_score: number | null; created_at: string;
  }>;
  timeline: ReturnType<typeof timeline>;
}

export function getCandidateDetail(orgId: string, candidateId: string): CandidateDetail | null {
  const candidate = repos.candidates.find(orgId, candidateId);
  if (!candidate) return null;

  return {
    candidate,
    attributes: repos.candidateAttributes.list(orgId, {
      where: 'candidate_id = ?', params: [candidateId], orderBy: 'kind, value',
    }),
    experiences: repos.candidateExperiences.list(orgId, {
      where: 'candidate_id = ?', params: [candidateId], orderBy: 'sort_order ASC',
    }),
    documents: repos.candidateDocuments.list(orgId, {
      where: 'candidate_id = ?', params: [candidateId], orderBy: 'created_at DESC',
      columns: 'id, org_id, candidate_id, kind, file_name, stored_name, mime_type, size_bytes, parse_status, created_at, NULL AS text_content',
    }),
    tags: candidateTags(orgId, candidateId),
    applications: getDb().all(
      `SELECT a.id, a.job_id, j.title AS job_title, cl.name AS client_name,
              a.stage_key, a.status, a.match_score, a.created_at
         FROM applications a
         JOIN jobs j ON j.id = a.job_id
    LEFT JOIN clients cl ON cl.id = j.client_id
        WHERE a.org_id = ? AND a.candidate_id = ?
        ORDER BY a.updated_at DESC`,
      orgId, candidateId,
    ),
    timeline: timeline(orgId, { candidateId, limit: 60 }),
  };
}

/** Candidate ids that already have an application for the given job. */
export function candidateIdsOnJob(orgId: string, jobId: string): Set<string> {
  const rows = getDb().all<{ candidate_id: string }>(
    'SELECT candidate_id FROM applications WHERE org_id = ? AND job_id = ?', orgId, jobId,
  );
  return new Set(rows.map((r) => r.candidate_id));
}
