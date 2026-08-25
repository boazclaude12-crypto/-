import './setup';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { rankCandidates, scoreMatch, type MatchCandidate, type MatchJob } from '../src/lib/matching/engine';
import { canonical } from '../src/lib/text';

function candidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    id: 'can_1',
    first_name: 'דני',
    last_name: 'כהן',
    city: 'חיפה',
    region: 'haifa',
    current_role: 'נהג חלוקה',
    years_experience: 5,
    desired_salary: 11000,
    current_salary: 10000,
    availability: 'immediate',
    employment_type: 'full_time',
    education: 'תיכונית',
    search_text: 'דני כהן נהג חלוקה חיפה רישיון c',
    attributes: [{ kind: 'license', value: 'רישיון C', value_norm: canonical('רישיון C') }],
    experience_titles: ['נהג חלוקה'],
    ...overrides,
  };
}

function job(overrides: Partial<MatchJob> = {}): MatchJob {
  return {
    id: 'job_1',
    title: 'נהג חלוקה',
    city: 'חיפה',
    region: 'haifa',
    salary_min: 10000,
    salary_max: 12000,
    salary_period: 'month',
    employment_type: 'full_time',
    description: null,
    requirements: [
      { kind: 'license', value: 'רישיון C', value_norm: canonical('רישיון C'), is_required: 1, weight: 1 },
    ],
    ...overrides,
  };
}

describe('matching engine', () => {
  test('a candidate meeting every requirement in the same city scores highly', () => {
    const result = scoreMatch(candidate(), job());
    assert.ok(result.score >= 85, `expected a strong match, got ${result.score}`);
    assert.equal(result.distanceKm, 0);
    assert.equal(result.salaryFit, 'within');
    assert.equal(result.requirements[0]!.met, true);
    assert.deepEqual(result.gaps, []);
    assert.ok(result.reasons.length > 0, 'a high score must be explained');
  });

  test('a missing mandatory requirement caps the score and is reported as a gap', () => {
    const result = scoreMatch(candidate({ attributes: [], search_text: 'דני כהן נהג חיפה' }), job());
    assert.ok(result.score <= 70, `a blocker must cap the score, got ${result.score}`);
    assert.equal(result.requirements[0]!.met, false);
    assert.ok(result.gaps.some((gap) => gap.includes('רישיון C')), 'the missing licence must be named');
  });

  test('distance lowers the score without eliminating the candidate', () => {
    const near = scoreMatch(candidate(), job());
    const far = scoreMatch(candidate({ city: 'באר שבע', region: 'south' }), job());
    assert.ok(far.score < near.score, 'a distant candidate must rank lower');
    assert.ok(far.distanceKm !== null && far.distanceKm > 100);
    assert.ok(far.gaps.some((gap) => gap.includes('מרחק')));
  });

  test('salary expectations above the range are penalised and explained', () => {
    const result = scoreMatch(candidate({ desired_salary: 20000, current_salary: 19000 }), job());
    assert.equal(result.salaryFit, 'above');
    assert.ok(result.gaps.some((gap) => gap.includes('שכר')));
  });

  test('licence spellings are matched through canonicalisation', () => {
    const withHebrewLetter = candidate({
      attributes: [{ kind: 'license', value: "רישיון ג'", value_norm: canonical("רישיון ג'") }],
      search_text: 'דני כהן',
    });
    const result = scoreMatch(withHebrewLetter, job());
    assert.equal(result.requirements[0]!.met, true, "רישיון ג' must satisfy a class C requirement");
  });

  test('unavailable candidates are flagged and rank below available ones', () => {
    const available = scoreMatch(candidate(), job());
    const unavailable = scoreMatch(candidate({ availability: 'unavailable' }), job());
    assert.ok(unavailable.score < available.score);
    assert.ok(unavailable.gaps.some((gap) => gap.includes('זמין')));
  });

  test('ranking sorts by score, honours minScore and caps the list', () => {
    const pool = [
      candidate({ id: 'a' }),
      candidate({ id: 'b', city: 'באר שבע', region: 'south' }),
      candidate({ id: 'c', attributes: [], search_text: 'ללא רישיון' }),
    ];
    const ranked = rankCandidates(pool, job(), { limit: 2 });
    assert.equal(ranked.length, 2);
    assert.equal(ranked[0]!.candidateId, 'a');
    assert.ok(ranked[0]!.score >= ranked[1]!.score);

    const strict = rankCandidates(pool, job(), { minScore: 90 });
    assert.ok(strict.every((match) => match.score >= 90));
  });

  test('the score breakdown sums to the score and never exceeds its maximums', () => {
    const result = scoreMatch(candidate(), job());
    const total = result.breakdown.reduce((sum, item) => sum + item.earned, 0);
    assert.ok(Math.abs(total - result.score) <= 1, 'breakdown must explain the number shown');
    for (const item of result.breakdown) {
      assert.ok(item.earned <= item.max + 0.01, `${item.label} exceeded its weight`);
      assert.ok(item.earned >= 0);
    }
  });

  test('a job with no structured requirements still scores and says why', () => {
    const result = scoreMatch(candidate(), job({ requirements: [] }));
    assert.ok(result.score > 0);
    assert.ok(result.gaps.some((gap) => gap.includes('לא הוגדרו דרישות')));
  });
});
