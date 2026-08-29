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
    max_commute_km: null,
    has_car: 0,
    willing_to_relocate: 0,
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
    work_mode: 'onsite',
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

  test('an unworkable commute is a blocker, not a deduction', () => {
    const near = scoreMatch(candidate(), job());
    const far = scoreMatch(candidate({ city: 'באר שבע', region: 'south' }), job());
    assert.ok(far.distanceKm !== null && far.distanceKm > 100);
    // Not merely lower — low enough that the recruiter is not sent on this call.
    assert.ok(near.score - far.score > 50, `${near.score} vs ${far.score}`);
    assert.ok(far.gaps.some((gap) => gap.includes('ק"מ')));
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

describe('commute', () => {
  const perfect = (overrides = {}) => candidate(overrides);

  test('a local candidate is unaffected', () => {
    const result = scoreMatch(perfect(), job({ city: 'קריית אתא' }));
    assert.equal(result.commute.status, 'comfortable');
    assert.equal(result.commute.cap, null);
    assert.equal(result.score, 100);
  });

  test('distance past the accepted commute caps the whole score', () => {
    // Otherwise-perfect candidate: without the cap the score would still be in the 80s.
    const result = scoreMatch(perfect(), job({ city: 'תל אביב', region: 'center' }));
    assert.equal(result.commute.status, 'unrealistic');
    assert.ok(result.commute.cap !== null && result.commute.cap < 40);
    assert.ok(result.score <= result.commute.cap!, `${result.score} > ${result.commute.cap}`);
    assert.ok(result.gaps.some((gap) => gap.includes('ק"מ')));
  });

  test('a car widens the default radius', () => {
    const target = job({ city: 'נתניה', region: 'sharon' });
    const without = scoreMatch(perfect({ has_car: 0 }), target).score;
    const with_ = scoreMatch(perfect({ has_car: 1 }), target).score;
    assert.ok(with_ > without, `${with_} should beat ${without}`);
  });

  test('a stated commute limit overrides the default', () => {
    const target = job({ city: 'תל אביב', region: 'center' });
    const result = scoreMatch(perfect({ has_car: 1, max_commute_km: 120 }), target);
    assert.equal(result.commute.status, 'acceptable');
    assert.equal(result.commute.cap, null);
    assert.ok(result.score >= 90);
  });

  test('remote work removes distance from the equation', () => {
    const result = scoreMatch(perfect(), job({ city: 'אילת', region: 'south', work_mode: 'remote' }));
    assert.equal(result.commute.status, 'remote');
    assert.equal(result.commute.cap, null);
    assert.equal(result.score, 100);
  });

  test('hybrid work doubles the tolerated commute', () => {
    const target = job({ city: 'נתניה', region: 'sharon' });
    const onsite = scoreMatch(perfect(), { ...target, work_mode: 'onsite' }).score;
    const hybrid = scoreMatch(perfect(), { ...target, work_mode: 'hybrid' }).score;
    assert.ok(hybrid > onsite, `hybrid ${hybrid} should beat onsite ${onsite}`);
  });

  test('willingness to relocate lifts the cap', () => {
    const target = job({ city: 'באר שבע', region: 'south' });
    const staying = scoreMatch(perfect(), target).score;
    const moving = scoreMatch(perfect({ willing_to_relocate: 1 }), target);
    assert.equal(moving.commute.cap, null);
    assert.ok(moving.score > staying);
  });

  test('an unknown city is never treated as far away', () => {
    const result = scoreMatch(perfect({ city: 'יישוב שלא בגזטיר', region: null }), job({ city: 'תל אביב' }));
    assert.equal(result.commute.status, 'unknown');
    assert.equal(result.commute.cap, null);
    assert.ok(result.score >= 70);
  });

  test('further away always ranks lower, even when both are out of range', () => {
    const target = job({ city: 'תל אביב', region: 'center' });
    const near = scoreMatch(perfect({ city: 'נתניה' }), target).score;
    const mid = scoreMatch(perfect({ city: 'חיפה' }), target).score;
    const far = scoreMatch(perfect({ city: 'אילת' }), target).score;
    assert.ok(near > mid && mid > far, `expected ${near} > ${mid} > ${far}`);
  });
});

describe('commute honesty', () => {
  test('an assumed radius is never described as something the candidate said', () => {
    const result = scoreMatch(candidate({ max_commute_km: null }), job({ city: 'תל אביב', region: 'center' }));
    assert.equal(result.commute.toleranceStated, false);
    assert.ok(!result.commute.note.includes('שהמועמד מוכן'), result.commute.note);
    assert.ok(!result.commute.note.includes('ציין'), result.commute.note);
  });

  test('a stated radius is attributed to the candidate', () => {
    const result = scoreMatch(candidate({ max_commute_km: 15 }), job({ city: 'תל אביב', region: 'center' }));
    assert.equal(result.commute.toleranceStated, true);
    assert.ok(result.commute.note.includes('שהמועמד מוכן'), result.commute.note);
  });
});
