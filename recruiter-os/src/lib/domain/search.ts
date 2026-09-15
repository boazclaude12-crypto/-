import { getDb } from '../db/index';
import { canonical, normalize, normalizePhone } from '../text';
import { lookupPlace } from '../geo';

export type SearchKind = 'candidate' | 'job' | 'client' | 'tag';

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  badge?: string;
}

export interface SearchResults {
  hits: SearchHit[];
  interpretation: string | null;
}

/**
 * Global search.
 *
 * Terms are ANDed against a denormalised `search_text` column, so a query like
 * "C חיפה" finds candidates who hold a class-C licence *and* live in Haifa —
 * the compound question a recruiter actually asks.
 */
export function globalSearch(orgId: string, query: string, limit = 8): SearchResults {
  const raw = query.trim();
  if (raw.length < 1) return { hits: [], interpretation: null };

  const db = getDb();
  const hits: SearchHit[] = [];
  const terms = normalize(raw).split(' ').filter(Boolean);
  const phone = normalizePhone(raw);
  const interpretationParts: string[] = [];

  // A bare licence letter ("C", "CE") should match the licence attribute, not any word.
  const licenseTerm = terms.find((term) => /^(c|ce|c1|d|b|a)$/i.test(term));
  const cityTerm = terms.map((term) => lookupPlace(term)).find((place) => place !== null);
  if (licenseTerm) interpretationParts.push(`רישיון ${licenseTerm.toUpperCase()}`);
  if (cityTerm) interpretationParts.push(cityTerm.city);

  const candidateClauses: string[] = [];
  const candidateParams: Array<string | number> = [];
  for (const term of terms) {
    candidateClauses.push('(c.search_text LIKE ? OR c.phone LIKE ?)');
    candidateParams.push(`%${term}%`, `%${term}%`);
  }
  if (phone && phone.length > 6) {
    candidateClauses.push('(c.phone LIKE ? OR ? = "")');
    candidateParams.push(`%${phone.slice(-7)}%`, '');
  }

  const candidates = db.all<{
    id: string; name: string; current_role: string | null; city: string | null; status_key: string;
  }>(
    `SELECT c.id, (c.first_name || ' ' || c.last_name) AS name, c.current_role, c.city, c.status_key
       FROM candidates c
      WHERE c.org_id = ? ${candidateClauses.length ? `AND ${candidateClauses.join(' AND ')}` : ''}
      ORDER BY c.updated_at DESC LIMIT ?`,
    orgId, ...candidateParams, limit,
  );
  for (const candidate of candidates) {
    hits.push({
      kind: 'candidate',
      id: candidate.id,
      title: candidate.name,
      subtitle: [candidate.current_role, candidate.city].filter(Boolean).join(' · ') || 'מועמד',
      href: `/candidates/${candidate.id}`,
    });
  }

  const jobClauses = terms.map(() => 'j.search_text LIKE ?');
  const jobs = db.all<{ id: string; title: string; city: string | null; client_name: string | null; status: string }>(
    `SELECT j.id, j.title, j.city, j.status, cl.name AS client_name
       FROM jobs j LEFT JOIN clients cl ON cl.id = j.client_id
      WHERE j.org_id = ? ${jobClauses.length ? `AND ${jobClauses.join(' AND ')}` : ''}
      ORDER BY j.updated_at DESC LIMIT ?`,
    orgId, ...terms.map((term) => `%${term}%`), limit,
  );
  for (const job of jobs) {
    hits.push({
      kind: 'job',
      id: job.id,
      title: job.title,
      subtitle: [job.client_name, job.city].filter(Boolean).join(' · ') || 'משרה',
      href: `/jobs/${job.id}`,
    });
  }

  const clients = db.all<{ id: string; name: string; city: string | null; industry: string | null }>(
    `SELECT id, name, city, industry FROM clients
      WHERE org_id = ? AND (name LIKE ? OR city LIKE ? OR industry LIKE ?)
      ORDER BY name LIMIT ?`,
    orgId, `%${raw}%`, `%${raw}%`, `%${raw}%`, limit,
  );
  for (const client of clients) {
    hits.push({
      kind: 'client',
      id: client.id,
      title: client.name,
      subtitle: [client.industry, client.city].filter(Boolean).join(' · ') || 'לקוח',
      href: `/clients/${client.id}`,
    });
  }

  const tags = db.all<{ id: string; name: string; n: number }>(
    `SELECT t.id, t.name, (SELECT COUNT(*) FROM candidate_tags ct WHERE ct.tag_id = t.id) AS n
       FROM tags t WHERE t.org_id = ? AND t.name LIKE ? ORDER BY n DESC LIMIT 3`,
    orgId, `%${raw.replace(/^#/, '')}%`,
  );
  for (const tag of tags) {
    hits.push({
      kind: 'tag',
      id: tag.id,
      title: `#${tag.name}`,
      subtitle: `${tag.n} מועמדים`,
      href: `/candidates?tag=${encodeURIComponent(tag.name)}`,
    });
  }

  return {
    hits,
    interpretation: interpretationParts.length ? `חיפוש: ${interpretationParts.join(' + ')}` : null,
  };
}

/** Structured candidate search used by the AI chat ("מי עם רישיון C בחיפה"). */
export function findCandidatesByCriteria(
  orgId: string,
  criteria: { license?: string; city?: string; role?: string; availability?: string; limit?: number },
) {
  const db = getDb();
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (criteria.license) {
    clauses.push(`EXISTS (SELECT 1 FROM candidate_attributes a
                    WHERE a.candidate_id = c.id AND a.kind = 'license' AND a.value_norm LIKE ?)`);
    params.push(`%${canonical(criteria.license)}%`);
  }
  if (criteria.city) {
    clauses.push('(c.city = ? OR c.region = (SELECT region FROM (SELECT ? AS region)))');
    params.push(criteria.city, criteria.city);
  }
  if (criteria.role) {
    clauses.push('(c.current_role LIKE ? OR c.search_text LIKE ?)');
    params.push(`%${criteria.role}%`, `%${normalize(criteria.role)}%`);
  }
  if (criteria.availability) {
    clauses.push('c.availability = ?');
    params.push(criteria.availability);
  }

  return db.all<{
    id: string; name: string; city: string | null; current_role: string | null;
    phone: string | null; availability: string | null;
  }>(
    `SELECT c.id, (c.first_name || ' ' || c.last_name) AS name, c.city, c.current_role, c.phone, c.availability
       FROM candidates c
      WHERE c.org_id = ? ${clauses.length ? `AND ${clauses.join(' AND ')}` : ''}
      ORDER BY c.updated_at DESC LIMIT ?`,
    orgId, ...params, criteria.limit ?? 15,
  );
}
