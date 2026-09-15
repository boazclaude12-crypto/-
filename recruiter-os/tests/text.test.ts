import './setup';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { canonical, normalize, normalizePhone, sameTerm, similarity } from '../src/lib/text';
import { distanceKm, regionOfCity } from '../src/lib/geo';
import { formatMoney, salaryRange, displayPhone, relativeTime } from '../src/lib/format';

describe('text normalisation', () => {
  test('normalises case, punctuation and whitespace', () => {
    assert.equal(normalize('  Rישיון,   C!  '), 'rישיון c');
    assert.equal(normalize(null), '');
  });

  test('canonicalises the ways a licence gets written', () => {
    assert.equal(canonical('רישיון C'), 'c');
    assert.equal(canonical('רשיון c'), 'c');
    assert.equal(canonical("רישיון ג'"), 'c');
    assert.equal(canonical('נהג C'), 'c');
  });

  test('treats equivalent role words as the same term', () => {
    assert.equal(sameTerm('מלגזה', 'מלגזן'), true);
    assert.equal(sameTerm('עובד מחסן', 'מחסנאי'), true);
    assert.equal(sameTerm('נהג חלוקה', 'נהג'), true);
    assert.equal(sameTerm('מחסנאי', 'מנופאי'), false);
  });

  test('similarity is bounded and order independent', () => {
    assert.equal(similarity('נהג חלוקה', 'נהג חלוקה'), 1);
    assert.equal(similarity('נהג חלוקה', 'מלגזן מחסן'), 0);
    const a = similarity('נהג חלוקה קירור', 'נהג חלוקה');
    assert.ok(a > 0 && a < 1);
  });

  test('normalises Israeli phone numbers to E.164 and back', () => {
    assert.equal(normalizePhone('052-123-4567'), '+972521234567');
    assert.equal(normalizePhone('0521234567'), '+972521234567');
    assert.equal(normalizePhone('+972521234567'), '+972521234567');
    assert.equal(normalizePhone('972521234567'), '+972521234567');
    assert.equal(normalizePhone(''), '');
    assert.equal(displayPhone('+972521234567'), '052-123-4567');
  });
});

describe('geography', () => {
  test('maps cities to regions', () => {
    assert.equal(regionOfCity('חיפה'), 'haifa');
    assert.equal(regionOfCity('באר שבע'), 'south');
    assert.equal(regionOfCity('עיר שלא קיימת'), null);
  });

  test('computes real distances and handles unknown places', () => {
    assert.equal(distanceKm('חיפה', 'חיפה'), 0);
    const haifaToTelAviv = distanceKm('חיפה', 'תל אביב');
    assert.ok(haifaToTelAviv !== null && haifaToTelAviv > 70 && haifaToTelAviv < 110);
    assert.equal(distanceKm('חיפה', 'לונדון'), null);
  });
});

describe('formatting', () => {
  test('money and salary ranges', () => {
    assert.equal(formatMoney(null), '—');
    assert.ok(formatMoney(12000).startsWith('₪'));
    assert.ok(salaryRange(10000, 12000, 'month').includes('/חודש'));
    assert.equal(salaryRange(null, null, 'month'), '—');
  });

  test('relative time reads naturally in both directions', () => {
    assert.equal(relativeTime(new Date().toISOString()), 'עכשיו');
    assert.ok(relativeTime(new Date(Date.now() - 3 * 3600_000).toISOString()).startsWith('לפני'));
    assert.ok(relativeTime(new Date(Date.now() + 3 * 3600_000).toISOString()).startsWith('בעוד'));
    assert.equal(relativeTime(null), '—');
  });
});
