import type { IdeaScores } from './schemas.js';

/**
 * Idea scoring (spec §10). Weights are configurable per channel; the defaults are the
 * formula from the specification. `competition` is inverted because low competition is good.
 */
export interface IdeaWeights {
  demand: number;
  trend: number;
  ctr: number;
  retention: number;
  novelty: number;
  evergreen: number;
  competition: number;
}

export const DEFAULT_IDEA_WEIGHTS: IdeaWeights = {
  demand: 0.25,
  trend: 0.2,
  ctr: 0.2,
  retention: 0.15,
  novelty: 0.1,
  evergreen: 0.1,
  competition: 0,
};

export interface ScoreBreakdown {
  overall: number;
  contributions: Record<string, number>;
  weights: IdeaWeights;
}

export function scoreIdea(scores: IdeaScores, weights: Partial<IdeaWeights> = {}): ScoreBreakdown {
  const w = normalizeWeights({ ...DEFAULT_IDEA_WEIGHTS, ...weights });
  const inputs: Record<keyof IdeaWeights, number> = {
    demand: scores.estimatedDemand,
    trend: scores.trendScore,
    ctr: scores.estimatedCtr,
    retention: scores.estimatedRetention,
    novelty: scores.novelty,
    evergreen: scores.evergreenScore,
    // Low competition is desirable, so it enters the sum inverted.
    competition: 100 - scores.competition,
  };

  const contributions: Record<string, number> = {};
  let overall = 0;
  for (const key of Object.keys(w) as (keyof IdeaWeights)[]) {
    const value = clamp(inputs[key], 0, 100) * w[key];
    contributions[key] = round(value);
    overall += value;
  }
  return { overall: round(clamp(overall, 0, 100)), contributions, weights: w };
}

/** Weights are normalised so a user-supplied set that does not sum to 1 still yields 0-100. */
export function normalizeWeights(w: IdeaWeights): IdeaWeights {
  const total = Object.values(w).reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) return { ...DEFAULT_IDEA_WEIGHTS };
  const out = {} as IdeaWeights;
  for (const key of Object.keys(w) as (keyof IdeaWeights)[]) {
    out[key] = Math.max(0, w[key]) / total;
  }
  return out;
}

/**
 * Content quality score (spec §52). Missing dimensions are dropped and the remaining
 * weights re-normalised, so a partially-produced video still gets a meaningful number.
 */
export const QUALITY_WEIGHTS = {
  research: 0.15,
  script: 0.15,
  hook: 0.12,
  retention: 0.15,
  visual: 0.13,
  audio: 0.1,
  thumbnail: 0.1,
  seo: 0.05,
  originality: 0.05,
} as const;

export type QualityDimension = keyof typeof QUALITY_WEIGHTS;
export type QualityScores = Partial<Record<QualityDimension, number>>;

export function scoreQuality(scores: QualityScores): { overall: number; parts: QualityScores } {
  let weightSum = 0;
  let acc = 0;
  const parts: QualityScores = {};
  for (const key of Object.keys(QUALITY_WEIGHTS) as QualityDimension[]) {
    const value = scores[key];
    if (value === undefined || Number.isNaN(value)) continue;
    const clamped = clamp(value, 0, 100);
    parts[key] = round(clamped);
    acc += clamped * QUALITY_WEIGHTS[key];
    weightSum += QUALITY_WEIGHTS[key];
  }
  if (weightSum === 0) return { overall: 0, parts };
  return { overall: round(acc / weightSum), parts };
}

/**
 * Fact confidence (spec §54). Contradicted claims are actively penalised rather than
 * merely averaged away, and unverified claims count as low confidence.
 */
export function factConfidence(
  claims: Array<{ verdict: 'SUPPORTED' | 'UNVERIFIED' | 'CONTRADICTED'; confidence: number }>,
): number {
  if (claims.length === 0) return 0;
  let sum = 0;
  for (const c of claims) {
    const conf = clamp(c.confidence, 0, 1);
    if (c.verdict === 'SUPPORTED') sum += conf;
    else if (c.verdict === 'UNVERIFIED') sum += conf * 0.3;
    else sum -= 0.5;
  }
  return round(clamp(sum / claims.length, 0, 1), 4);
}

export function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** Weighted mean that ignores undefined entries. */
export function weightedAverage(entries: Array<[value: number | undefined, weight: number]>): number {
  let acc = 0;
  let w = 0;
  for (const [value, weight] of entries) {
    if (value === undefined || Number.isNaN(value)) continue;
    acc += value * weight;
    w += weight;
  }
  return w === 0 ? 0 : round(acc / w);
}
