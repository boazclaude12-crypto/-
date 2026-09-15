import './setup';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseJobText } from '../src/lib/ai/job-parser';

/** The shape openings actually arrive in — a client's WhatsApp message. */
const DRIVER_POST = `דרושים נהגי חלוקה C לחיפה

שכר 55 ₪ לשעה, משמרות בוקר 07:00-16:00

דרישות חובה:
- רישיון נהיגה C
- ניסיון של שנתיים בחלוקה
- עברית ברמה טובה

יתרון:
- רישיון מלגזה
- ניסיון בקירור

תנאים:
ארוחות, הסעות, קרן השתלמות`;

const WAREHOUSE_POST = `מחסנאי/ת למרכז לוגיסטי בנתניה
משרה מלאה, 9,000-11,000 ₪

דרישות התפקיד:
ניסיון בניהול מלאי - חובה
שליטה באקסל
רישיון מלגזה - יתרון`;

describe('job description parsing', () => {
  test('reads the opening out of a message a client would send', () => {
    const job = parseJobText(DRIVER_POST);
    assert.equal(job.title, 'נהגי חלוקה C');
    assert.equal(job.city, 'חיפה');
    assert.equal(job.salary_min, 55);
    assert.equal(job.salary_period, 'hour');
    assert.equal(job.employment_type, 'shifts');
    assert.equal(job.hours, '07:00-16:00');
  });

  test('mandatory and preferred requirements are kept apart', () => {
    const job = parseJobText(DRIVER_POST);
    const required = job.requirements.filter((r) => r.is_required).map((r) => r.value);
    const optional = job.requirements.filter((r) => !r.is_required).map((r) => r.value);

    // This distinction decides whether a candidate is capped or merely deducted.
    assert.ok(required.some((v) => v.includes('רישיון C')), JSON.stringify(required));
    assert.ok(optional.some((v) => v.includes('מלגזה')), JSON.stringify(optional));
    assert.ok(!required.some((v) => v.includes('קירור')), 'יתרון must never become a blocker');
  });

  test('a licence is labelled the way the CV parser labels it', async () => {
    const { parseCvText } = await import('../src/lib/ai/cv-parser');
    const job = parseJobText(DRIVER_POST);
    const cv = parseCvText('דני כהן\nרישיונות\nרישיון נהיגה C');
    const requirement = job.requirements.find((r) => r.kind === 'license')!;
    // If the two sides label it differently, the requirement can never be met.
    assert.ok(cv.licenses.includes(requirement.value), `${requirement.value} vs ${cv.licenses}`);
  });

  test('an inline חובה marker beats the section it sits under', () => {
    const job = parseJobText(WAREHOUSE_POST);
    const inventory = job.requirements.find((r) => r.value.includes('מלאי'))!;
    const forklift = job.requirements.find((r) => r.value.includes('מלגזה'))!;
    assert.equal(inventory.is_required, true);
    assert.equal(forklift.is_required, false, 'marked יתרון inside a mandatory section');
  });

  test('a monthly range is read as a range', () => {
    const job = parseJobText(WAREHOUSE_POST);
    assert.equal(job.salary_min, 9000);
    assert.equal(job.salary_max, 11000);
    assert.equal(job.salary_period, 'month');
  });

  test('a town written with its preposition is still found', () => {
    // Hebrew glues the preposition on: "באשקלון" is one token.
    const job = parseJobText('טכנאי גידול לחברה מובילה באשקלון\nדרישות:\nנכונות לעבודה פיזית');
    assert.equal(job.city, 'אשקלון');
  });

  test('what the post never said is reported, not invented', () => {
    const job = parseJobText('דרוש עובד כללי\nלפרטים: 050-1234567');
    assert.ok(job.missing.includes('עיר'));
    assert.ok(job.missing.includes('שכר'));
    assert.ok(job.missing.includes('דרישות'));
    assert.equal(job.salary_min, null);
    assert.equal(job.requirements.length, 0);
  });

  test('prose outside a requirements section is not mistaken for a requirement', () => {
    const job = parseJobText(`דרוש מחסנאי לחיפה
החברה שלנו היא מהמובילות בתחום ומעסיקה מאות עובדים.
דרישות:
רישיון מלגזה`);
    assert.equal(job.requirements.length, 1);
  });
});
