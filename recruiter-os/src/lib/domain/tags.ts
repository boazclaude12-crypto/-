import { getDb } from '../db/index';
import { repos } from '../db/repos';
import { nowIso } from '../time';
import type { TagRow } from '../types';

const PALETTE = ['sky', 'emerald', 'amber', 'violet', 'rose', 'cyan', 'indigo', 'orange'];

function colorFor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return PALETTE[hash % PALETTE.length]!;
}

/** Tags are free-form; the first use creates them. */
export function upsertTag(orgId: string, rawName: string): TagRow {
  const name = rawName.trim().replace(/^#/, '').slice(0, 40);
  if (!name) throw new Error('Tag name is required');
  const existing = repos.tags.findBy(orgId, 'name = ?', name);
  if (existing) return existing;
  return repos.tags.create(orgId, { name, color: colorFor(name) });
}

function syncLinks(
  orgId: string,
  table: 'candidate_tags' | 'job_tags',
  column: 'candidate_id' | 'job_id',
  entityId: string,
  names: string[],
): void {
  const db = getDb();
  const tagIds = names.filter((n) => n.trim()).map((name) => upsertTag(orgId, name).id);
  db.run(`DELETE FROM ${table} WHERE org_id = ? AND ${column} = ?`, orgId, entityId);
  for (const tagId of new Set(tagIds)) {
    db.run(
      `INSERT OR IGNORE INTO ${table} (org_id, ${column}, tag_id, created_at) VALUES (?, ?, ?, ?)`,
      orgId, entityId, tagId, nowIso(),
    );
  }
}

export const setCandidateTags = (orgId: string, candidateId: string, names: string[]) =>
  syncLinks(orgId, 'candidate_tags', 'candidate_id', candidateId, names);

export const setJobTags = (orgId: string, jobId: string, names: string[]) =>
  syncLinks(orgId, 'job_tags', 'job_id', jobId, names);

function tagsFor(orgId: string, table: string, column: string, entityId: string): TagRow[] {
  return getDb().all<TagRow>(
    `SELECT t.* FROM tags t JOIN ${table} l ON l.tag_id = t.id
      WHERE l.org_id = ? AND l.${column} = ? ORDER BY t.name`,
    orgId, entityId,
  );
}

export const candidateTags = (orgId: string, candidateId: string) =>
  tagsFor(orgId, 'candidate_tags', 'candidate_id', candidateId);

export const jobTags = (orgId: string, jobId: string) => tagsFor(orgId, 'job_tags', 'job_id', jobId);

/** Tag cloud with usage counts, for the tags screen and filter menus. */
export function tagsWithCounts(orgId: string) {
  return getDb().all<TagRow & { candidate_count: number; job_count: number }>(
    `SELECT t.*,
            (SELECT COUNT(*) FROM candidate_tags ct WHERE ct.tag_id = t.id) AS candidate_count,
            (SELECT COUNT(*) FROM job_tags jt WHERE jt.tag_id = t.id) AS job_count
       FROM tags t WHERE t.org_id = ?
      ORDER BY candidate_count DESC, t.name ASC`,
    orgId,
  );
}
