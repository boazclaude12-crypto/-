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
  /** Commute the candidate accepts, in km. Null falls back to a driving-based default. */
  max_commute_km: number | null;
  has_car: number | null;
  willing_to_relocate: number | null;
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
  /** onsite | hybrid | remote */
  work_mode: string | null;
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
  /** Why distance scored the way it did — shown next to the score, never hidden. */
  commute: CommuteVerdict;
  salaryFit: 'within' | 'above' | 'below' | 'unknown';
  availabilityLabel: string;
  breakdown: Array<{ label: string; earned: number; max: number }>;
}

/**
 * Relative importance of each dimension. They sum to 100.
 *
 * Location carries more weight than any dimension except the requirements themselves.
 * A placement that fails because the commute is unworkable fails just as completely as
 * one that fails on a missing licence, and it fails after everyone's time is spent.
 */
export const WEIGHTS = {
  requirements: 38,
  role: 14,
  location: 22,
  salary: 9,
  availability: 9,
  experience: 8,
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

export interface CommuteVerdict {
  km: number | null;
  ratio: number;
  /** Highest total score this distance still allows, or null when it caps nothing. */
  cap: number | null;
  /** The commute this candidate was judged against, in km. */
  toleranceKm: number;
  /** Whether that figure came from the candidate or from a default. */
  toleranceStated: boolean;
  status: 'remote' | 'comfortable' | 'acceptable' | 'stretch' | 'unrealistic' | 'relocating' | 'unknown';
  note: string;
}

/**
 * Commute a candidate is assumed to accept when they have not said.
 *
 * Someone with a car treats 40 km as an ordinary drive. Without one the same trip means
 * buses and connections, and the realistic radius collapses — which is why the fallback
 * is not a single number.
 */
const DEFAULT_COMMUTE_KM = { withCar: 40, withoutCar: 20 } as const;

/**
 * Ceiling on the total score once the commute passes what the candidate accepts.
 *
 * Continuous rather than banded, for two reasons: there is no real difference between
 * one kilometre inside the limit and one kilometre outside it, so the curve starts at
 * 100 exactly where the limit is and falls from there; and because it keeps falling,
 * two candidates who are both too far apart still rank in the right order — 50 km out
 * is worse than 30 km out, and the list has to show that.
 */
function commuteCeiling(relative: number): number {
  return Math.max(8, Math.round(100 / relative ** 1.3));
}

/**
 * Scores the journey to work.
 *
 * Distance is judged against what this candidate actually accepts rather than one fixed
 * rule, because that is what makes the number honest: 60 km is nothing to a driver who
 * said they will travel 80, and impossible for someone without a car who said 15. Past
 * that personal limit the distance stops being a deduction and becomes a ceiling on the
 * whole score — a candidate who cannot get to work is not a 90% match no matter how
 * perfectly the rest of the profile reads.
 *
 * Nothing is capped on missing data. An unknown city is unknown, not far.
 */
function locationScore(candidate: MatchCandidate, job: MatchJob): CommuteVerdict {
  const km = distanceKm(candidate.city, job.city);
  const hasCar = (candidate.has_car ?? 0) === 1;
  const stated = !!candidate.max_commute_km && candidate.max_commute_km > 0;
  const base = stated
    ? candidate.max_commute_km!
    : hasCar
      ? DEFAULT_COMMUTE_KM.withCar
      : DEFAULT_COMMUTE_KM.withoutCar;

  // Hybrid means the trip happens some days, not every day, so the same distance is
  // easier to live with. Remote means it never happens.
  const workMode = job.work_mode ?? 'onsite';
  if (workMode === 'remote') {
    return {
      km, ratio: 1, cap: null, toleranceKm: base, toleranceStated: stated, status: 'remote',
      note: 'משרה מרחוק — המרחק לא רלוונטי',
    };
  }
  const tolerance = workMode === 'hybrid' ? base * 2 : base;

  if (km === null) {
    const sameRegion = candidate.region && job.region ? candidate.region === job.region : null;
    const ratio = sameRegion === null ? 0.5 : sameRegion ? 0.8 : 0.3;
    return {
      km: null, ratio, cap: null, toleranceKm: tolerance, toleranceStated: stated, status: 'unknown',
      note: sameRegion === null
        ? 'לא ידוע מאיפה המועמד — המרחק לא נלקח בחשבון'
        : sameRegion
          ? 'אותו אזור, עיר לא ידועה'
          : 'אזור אחר, עיר לא ידועה',
    };
  }

  const relative = km / tolerance;

  if (relative <= 0.5) {
    return {
      km, ratio: 1, cap: null, toleranceKm: tolerance, toleranceStated: stated, status: 'comfortable',
      note: km === 0 ? `גר ב${job.city}` : `${km} ק"מ — נסיעה קצרה`,
    };
  }

  if (relative <= 1) {
    // Linear from 1.0 at half the limit down to 0.7 at the limit itself.
    const ratio = 1 - ((relative - 0.5) / 0.5) * 0.3;
    return {
      km, ratio, cap: null, toleranceKm: tolerance, toleranceStated: stated, status: 'acceptable',
      note: stated
        ? `${km} ק"מ — בתוך טווח הנסיעה שהמועמד ציין (${Math.round(tolerance)} ק"מ)`
        : `${km} ק"מ — נסיעה סבירה`,
    };
  }

  // Past the limit. Someone open to moving is judged on the move, not the drive.
  if ((candidate.willing_to_relocate ?? 0) === 1) {
    return {
      km, ratio: 0.6, cap: null, toleranceKm: tolerance, toleranceStated: stated, status: 'relocating',
      note: `${km} ק"מ, אבל המועמד מוכן לעבור דירה`,
    };
  }

  const ratio = 0.7 / relative ** 1.6;
  const cap = commuteCeiling(relative);
  return {
    km,
    ratio: Math.max(0, ratio),
    cap,
    toleranceKm: tolerance,
    toleranceStated: stated,
    status: relative <= 1.75 ? 'stretch' : 'unrealistic',
    // Never put words in the candidate's mouth: an assumed radius is labelled as one, so
    // the recruiter knows a two-second edit may change the score.
    note: stated
      ? `${km} ק"מ — מעבר ל-${Math.round(tolerance)} ק"מ שהמועמד מוכן לנסוע`
      : `${km} ק"מ — רחוק, ולא ידוע כמה המועמד מוכן לנסוע${hasCar ? '' : ' (לא ידוע על רכב)'}`,
  };
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

  // Blockers cap the score rather than shaving points off it. A missing licence or an
  // unreachable workplace does not make a candidate slightly worse — it makes the
  // placement unlikely, and the number has to say so.
  const missingRequired = requiredChecks.filter((c) => !c.met);
  if (missingRequired.length > 0) score = Math.min(score, 100 - missingRequired.length * 20 - 10);
  if (location.cap !== null) score = Math.min(score, location.cap);
  score = Math.max(0, Math.min(100, score));

  const reasons: string[] = [];
  const gaps: string[] = [];

  const metRequired = requiredChecks.filter((c) => c.met);
  if (metRequired.length) {
    reasons.push(`עומד ב-${metRequired.length} מתוך ${requiredChecks.length} דרישות חובה: ${metRequired.map((c) => c.value).join(', ')}`);
  }
  if (role >= 0.7) reasons.push(`תפקיד קרוב מאוד למשרה (${candidate.current_role ?? 'ניסיון קודם'})`);
  else if (role >= 0.35) reasons.push('רקע חלקי בתפקיד דומה');
  if (location.status === 'remote' || location.status === 'comfortable' || location.status === 'acceptable') {
    reasons.push(location.note);
  }
  if (salary.fit === 'within') reasons.push('ציפיות השכר בתוך טווח המשרה');
  if (candidate.availability === 'immediate') reasons.push('זמין מיידית');
  if ((candidate.years_experience ?? 0) >= 3) reasons.push(`${candidate.years_experience} שנות ניסיון`);

  for (const check of missingRequired) {
    gaps.push(`חסר: ${labelOf(REQUIREMENT_KINDS, check.kind)} — ${check.value}`);
  }
  if (location.status === 'stretch' || location.status === 'unrealistic') {
    gaps.push(`${location.note} — הציון מוגבל ל-${location.cap}`);
  } else if (location.status === 'relocating') {
    gaps.push(location.note);
  } else if (location.status === 'unknown' && location.km === null) {
    gaps.push(location.note);
  }
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
    commute: location,
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
