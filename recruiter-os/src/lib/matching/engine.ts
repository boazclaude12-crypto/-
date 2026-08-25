import { canonical, mentions, normalize, sameTerm, similarity } from '../text';
import { distanceKm } from '../geo';
import { labelOf, AVAILABILITY, REQUIREMENT_KINDS } from '../domain/constants';

export interface MatchCandidate {
  id: string;
  first_name: string;
  last_name: string;
  city: string | null;
  region: string | null;
  current_role: string | null;
  years_experience: number | null;
  desired_salary: number | null;
  current_salary: number | null;
  availability: string | null;
  employment_type: string | null;
  education: string | null;
  search_text: string;
  attributes: Array<{ kind: string; value: string; value_norm: string }>;
  experience_titles: string[];
}

export interface MatchJob {
  id: string;
  title: string;
  city: string | null;
  region: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: string;
  employment_type: string | null;
  description: string | null;
  requirements: Array<{ kind: string; value: string; value_norm: string; is_required: number; weight: number }>;
}

export interface RequirementCheck {
  kind: string;
  value: string;
  required: boolean;
  met: boolean;
  evidence: string | null;
}

export interface MatchResult {
  candidateId: string;
  score: number;
  reasons: string[];
  gaps: string[];
  requirements: RequirementCheck[];
  distanceKm: number | null;
  salaryFit: 'within' | 'above' | 'below' | 'unknown';
  availabilityLabel: string;
  breakdown: Array<{ label: string; earned: number; max: number }>;
}

/** Relative importance of each dimension. They sum to 100. */
export const WEIGHTS = {
  requirements: 40,
  role: 15,
  location: 15,
  salary: 10,
  availability: 10,
  experience: 10,
} as const;

const AVAILABILITY_SCORE: Record<string, number> = {
  immediate: 1,
  two_weeks: 0.85,
  month: 0.6,
  later: 0.3,
  unavailable: 0,
};

/** Looks for a requirement across structured attributes first, then free text. */
function checkRequirement(
  candidate: MatchCandidate,
  requirement: MatchJob['requirements'][number],
): RequirementCheck {
  const base = {
    kind: requirement.kind,
    value: requirement.value,
    required: requirement.is_required === 1,
  };

  if (requirement.kind === 'experience') {
    const needed = Number(requirement.value.match(/\d+/)?.[0] ?? 0);
    const has = candidate.years_experience ?? 0;
    return { ...base, met: has >= needed, evidence: has ? `${has} שנות ניסיון` : null };
  }

  if (requirement.kind === 'education') {
    const met = mentions(candidate.education, requirement.value);
    return { ...base, met, evidence: met ? candidate.education : null };
  }

  const attribute = candidate.attributes.find(
    (a) => a.value_norm === requirement.value_norm || sameTerm(a.value, requirement.value),
  );
  if (attribute) return { ...base, met: true, evidence: attribute.value };

  const title = candidate.experience_titles.find((t) => sameTerm(t, requirement.value));
  if (title) return { ...base, met: true, evidence: title };

  if (candidate.current_role && sameTerm(candidate.current_role, requirement.value)) {
    return { ...base, met: true, evidence: candidate.current_role };
  }

  if (mentions(candidate.search_text, requirement.value)) {
    return { ...base, met: true, evidence: 'מופיע בקורות החיים' };
  }

  return { ...base, met: false, evidence: null };
}

function salaryFit(candidate: MatchCandidate, job: MatchJob): { fit: MatchResult['salaryFit']; ratio: number } {
  const desired = candidate.desired_salary ?? candidate.current_salary;
  if (!desired || (!job.salary_min && !job.salary_max)) return { fit: 'unknown', ratio: 0.6 };
  const min = job.salary_min ?? job.salary_max!;
  const max = job.salary_max ?? job.salary_min!;
  if (desired <= max && desired >= min * 0.8) return { fit: 'within', ratio: 1 };
  if (desired < min * 0.8) return { fit: 'below', ratio: 0.9 };
  const overshoot = (desired - max) / max;
  return { fit: 'above', ratio: overshoot <= 0.1 ? 0.7 : overshoot <= 0.25 ? 0.35 : 0 };
}

function locationScore(candidate: MatchCandidate, job: MatchJob): { ratio: number; km: number | null } {
  const km = distanceKm(candidate.city, job.city);
  if (km === null) {
    if (candidate.region && job.region) return { ratio: candidate.region === job.region ? 0.8 : 0.3, km: null };
    return { ratio: 0.5, km: null };
  }
  if (km <= 10) return { ratio: 1, km };
  if (km <= 25) return { ratio: 0.85, km };
  if (km <= 50) return { ratio: 0.6, km };
  if (km <= 80) return { ratio: 0.3, km };
  return { ratio: 0.1, km };
}

function roleScore(candidate: MatchCandidate, job: MatchJob): number {
  const titles = [candidate.current_role ?? '', ...candidate.experience_titles];
  let best = 0;
  for (const title of titles) {
    if (!title) continue;
    if (sameTerm(title, job.title)) return 1;
    best = Math.max(best, similarity(title, job.title));
  }
  if (best === 0 && canonical(job.title) && mentions(candidate.search_text, canonical(job.title))) return 0.5;
  return best;
}

function experienceScore(candidate: MatchCandidate, job: MatchJob): number {
  const requirement = job.requirements.find((r) => r.kind === 'experience');
  const needed = requirement ? Number(requirement.value.match(/\d+/)?.[0] ?? 0) : 0;
  const has = candidate.years_experience ?? 0;
  if (needed === 0) return has >= 1 ? 1 : 0.6;
  if (has >= needed) return 1;
  if (has >= needed * 0.6) return 0.5;
  return has > 0 ? 0.2 : 0;
}

/**
 * Scores one candidate against one job and explains the result.
 *
 * Deterministic on purpose: the same data always produces the same score, the
 * reasoning is inspectable, and it costs nothing to run over a whole database.
 */
export function scoreMatch(candidate: MatchCandidate, job: MatchJob): MatchResult {
  const checks = job.requirements.map((requirement) => checkRequirement(candidate, requirement));

  const requiredChecks = checks.filter((c) => c.required);
  const optionalChecks = checks.filter((c) => !c.required);
  const requiredWeight = requiredChecks.length ? requiredChecks.filter((c) => c.met).length / requiredChecks.length : 1;
  const optionalWeight = optionalChecks.length ? optionalChecks.filter((c) => c.met).length / optionalChecks.length : 1;
  const requirementRatio = requiredChecks.length
    ? requiredWeight * 0.8 + optionalWeight * 0.2
    : optionalWeight;

  const role = roleScore(candidate, job);
  const location = locationScore(candidate, job);
  const salary = salaryFit(candidate, job);
  const availabilityRatio = AVAILABILITY_SCORE[candidate.availability ?? ''] ?? 0.5;
  const experience = experienceScore(candidate, job);

  const breakdown = [
    { label: 'דרישות המשרה', earned: requirementRatio * WEIGHTS.requirements, max: WEIGHTS.requirements },
    { label: 'התאמת תפקיד', earned: role * WEIGHTS.role, max: WEIGHTS.role },
    { label: 'מיקום', earned: location.ratio * WEIGHTS.location, max: WEIGHTS.location },
    { label: 'ציפיות שכר', earned: salary.ratio * WEIGHTS.salary, max: WEIGHTS.salary },
    { label: 'זמינות', earned: availabilityRatio * WEIGHTS.availability, max: WEIGHTS.availability },
    { label: 'ניסיון', earned: experience * WEIGHTS.experience, max: WEIGHTS.experience },
  ].map((item) => ({ ...item, earned: Math.round(item.earned * 10) / 10 }));

  let score = Math.round(breakdown.reduce((sum, item) => sum + item.earned, 0));

  // A missing mandatory requirement caps the score: it is a blocker, not a deduction.
  const missingRequired = requiredChecks.filter((c) => !c.met);
  if (missingRequired.length > 0) score = Math.min(score, 100 - missingRequired.length * 20 - 10);
  score = Math.max(0, Math.min(100, score));

  const reasons: string[] = [];
  const gaps: string[] = [];

  const metRequired = requiredChecks.filter((c) => c.met);
  if (metRequired.length) {
    reasons.push(`עומד ב-${metRequired.length} מתוך ${requiredChecks.length} דרישות חובה: ${metRequired.map((c) => c.value).join(', ')}`);
  }
  if (role >= 0.7) reasons.push(`תפקיד קרוב מאוד למשרה (${candidate.current_role ?? 'ניסיון קודם'})`);
  else if (role >= 0.35) reasons.push('רקע חלקי בתפקיד דומה');
  if (location.km !== null && location.km <= 25) {
    reasons.push(location.km === 0 ? `גר ב${job.city}` : `${location.km} ק"מ מהמשרה`);
  }
  if (salary.fit === 'within') reasons.push('ציפיות השכר בתוך טווח המשרה');
  if (candidate.availability === 'immediate') reasons.push('זמין מיידית');
  if ((candidate.years_experience ?? 0) >= 3) reasons.push(`${candidate.years_experience} שנות ניסיון`);

  for (const check of missingRequired) {
    gaps.push(`חסר: ${labelOf(REQUIREMENT_KINDS, check.kind)} — ${check.value}`);
  }
  if (location.km !== null && location.km > 50) gaps.push(`מרחק גדול מהמשרה (${location.km} ק"מ)`);
  if (salary.fit === 'above') gaps.push('ציפיות השכר גבוהות מטווח המשרה');
  if (candidate.availability === 'unavailable') gaps.push('לא זמין כרגע');
  if (checks.length === 0) gaps.push('למשרה לא הוגדרו דרישות — הציון מבוסס על תפקיד, מיקום וזמינות בלבד');

  return {
    candidateId: candidate.id,
    score,
    reasons,
    gaps,
    requirements: checks,
    distanceKm: location.km,
    salaryFit: salary.fit,
    availabilityLabel: labelOf(AVAILABILITY, candidate.availability, 'לא ידוע'),
    breakdown,
  };
}

/** Ranks a pool of candidates for one job. */
export function rankCandidates(
  candidates: MatchCandidate[],
  job: MatchJob,
  options: { minScore?: number; limit?: number } = {},
): MatchResult[] {
  const minScore = options.minScore ?? 0;
  return candidates
    .map((candidate) => scoreMatch(candidate, job))
    .filter((result) => result.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit ?? 20);
}

export function matchLabel(score: number): { label: string; tone: 'strong' | 'good' | 'weak' } {
  if (score >= 85) return { label: 'התאמה גבוהה', tone: 'strong' };
  if (score >= 65) return { label: 'התאמה טובה', tone: 'good' };
  return { label: 'התאמה חלקית', tone: 'weak' };
}

/** Free-text fallback used when a job has no structured requirements yet. */
export function keywordsFromJob(job: MatchJob): string[] {
  return Array.from(new Set([canonical(job.title), ...job.requirements.map((r) => r.value_norm)])).filter(Boolean);
}

export function normalizedTitle(title: string): string {
  return normalize(title);
}
