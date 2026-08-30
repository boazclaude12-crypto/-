import './setup';
import { createOrg } from './setup';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntakeEmail } from '../src/lib/ai/email-intake';
import { importApplication } from '../src/lib/domain/cv-intake';
import { getCandidateDetail } from '../src/lib/domain/candidates';

const ALLJOBS_BODY = `| שלום רב, |
| ממש עכשיו קיבלת קורות חיים חדשים למשרת: |
| "נהגי 12 טון" |
| קורות החיים של המועמד מצורפים למייל זה. |
| שם המועמד: ערן ברוך |
| מגורים: תל מונד |
| טלפון: 0504050773 |
| להפסקת פרסום המשרה - לחץ כאן[](https://www.alljobs.co.il/Employer/Remove.aspx?JobID=8792573) |`;

const CV_TEXT = `ערן ברוך
נהג חלוקה
ניסיון תעסוקתי
נהג 12 טון, תובלה ישראלית, 2018 - היום
רישיונות
רישיון נהיגה C
בעל רכב פרטי
השכלה
תיכונית`;

function cvFile(text = CV_TEXT) {
  return { buffer: Buffer.from(text, 'utf8'), fileName: 'cv.txt', mimeType: 'text/plain' };
}

/** Exactly what the mailbox sync does with one message, minus the IMAP transport. */
async function intake(orgId: string, userId: string, body: string, document?: ReturnType<typeof cvFile>) {
  const parsed = parseIntakeEmail({ from: 'alljobs@alljob.co.il', body });
  return importApplication(orgId, userId, {
    document,
    hints: {
      first_name: parsed.first_name,
      last_name: parsed.last_name,
      city: parsed.city,
      phone: parsed.phone,
      email: parsed.email,
    },
    note: parsed.job_title ? `פנייה למשרת "${parsed.job_title}"` : undefined,
  });
}

describe('mailbox intake', () => {
  test('an application becomes a candidate with the CV attached', async () => {
    const { orgId, userId } = await createOrg();
    const outcome = await intake(orgId, userId, ALLJOBS_BODY, cvFile());

    assert.equal(outcome.status, 'created');
    const detail = getCandidateDetail(orgId, outcome.candidateId!);
    assert.equal(detail!.candidate.first_name, 'ערן');
    assert.equal(detail!.candidate.last_name, 'ברוך');
    assert.equal(detail!.candidate.city, 'תל מונד');
    assert.equal(detail!.candidate.phone, '+972504050773');
    // The licence comes from the CV; the board never sends it.
    assert.ok(detail!.attributes.some((a) => a.kind === 'license'), 'the licence must come through');
    assert.equal(detail!.candidate.has_car, 1, 'the CV says they drive');
    assert.equal(detail!.documents.length, 1, 'the original file must be kept');
  });

  test('the board wins over the CV for town and phone', async () => {
    const { orgId, userId } = await createOrg();
    // The CV carries an older address and number; the board has what was typed today.
    const stale = `${CV_TEXT}\nכתובת: אילת\nטלפון: 03-1112222`;
    const outcome = await intake(orgId, userId, ALLJOBS_BODY, cvFile(stale));

    const detail = getCandidateDetail(orgId, outcome.candidateId!);
    assert.equal(detail!.candidate.city, 'תל מונד');
    assert.equal(detail!.candidate.phone, '+972504050773');
  });

  test('an unreadable CV still files the lead the email described', async () => {
    const { orgId, userId } = await createOrg();
    const outcome = await intake(orgId, userId, ALLJOBS_BODY, {
      buffer: Buffer.from([0x00, 0x01, 0x02]),
      fileName: 'scan.bin',
      mimeType: 'application/octet-stream',
    });

    assert.equal(outcome.status, 'created', 'a name and a phone are enough to be worth a call');
    const detail = getCandidateDetail(orgId, outcome.candidateId!);
    assert.equal(detail!.candidate.first_name, 'ערן');
    assert.equal(detail!.candidate.phone, '+972504050773');
    assert.ok(outcome.reason?.includes('לא'), 'and it must say the file could not be read');
  });

  test('the same application arriving twice yields one candidate', async () => {
    const { orgId, userId } = await createOrg();
    const first = await intake(orgId, userId, ALLJOBS_BODY, cvFile());
    const second = await intake(orgId, userId, ALLJOBS_BODY, cvFile());

    assert.equal(first.status, 'created');
    assert.equal(second.status, 'duplicate');
    assert.equal(second.candidateId, first.candidateId);
  });

  test('one org never de-duplicates against another org candidates', async () => {
    const a = await createOrg();
    const b = await createOrg();
    const inA = await intake(a.orgId, a.userId, ALLJOBS_BODY, cvFile());
    const inB = await intake(b.orgId, b.userId, ALLJOBS_BODY, cvFile());

    assert.equal(inA.status, 'created');
    assert.equal(inB.status, 'created', 'the same person may exist in two accounts');
    assert.notEqual(inA.candidateId, inB.candidateId);
  });

  test('an email with nothing identifying is not filed as a candidate', async () => {
    const { orgId, userId } = await createOrg();
    const outcome = await importApplication(orgId, userId, {
      document: { buffer: Buffer.from([0x00, 0x01]), fileName: 'x.bin', mimeType: 'application/octet-stream' },
      hints: {},
    });
    assert.equal(outcome.status, 'unreadable');
    assert.equal(outcome.candidateId, null);
  });
});

describe('a CV that arrives as a photo', () => {
  // The most common form an application takes when it comes off WhatsApp.
  const PHOTO = {
    // A minimal JPEG header — enough for the type checks that matter here.
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),
    fileName: 'IMG-20260830-WA0007.jpg',
    mimeType: 'image/jpeg',
  };

  test('is kept and attached, not discarded', async () => {
    const { orgId, userId } = await createOrg();
    const outcome = await intake(orgId, userId, ALLJOBS_BODY, PHOTO);

    assert.equal(outcome.status, 'created');
    const detail = getCandidateDetail(orgId, outcome.candidateId!)!;
    assert.equal(detail.candidate.first_name, 'ערן');
    assert.equal(detail.documents.length, 1, 'the picture must stay on the record');
    assert.equal(detail.documents[0]!.file_name, 'IMG-20260830-WA0007.jpg');
  });

  test('says the details are missing because nobody could read them', async () => {
    const { orgId, userId } = await createOrg();
    const outcome = await intake(orgId, userId, ALLJOBS_BODY, PHOTO);
    assert.ok(outcome.reason?.includes('תמונה'), outcome.reason ?? '(none)');
  });

  test('a photo with no accompanying details is not filed as an empty candidate', async () => {
    const { orgId, userId } = await createOrg();
    const { importApplication } = await import('../src/lib/domain/cv-intake');
    const outcome = await importApplication(orgId, userId, { document: PHOTO, hints: {} });
    assert.equal(outcome.status, 'unreadable');
    assert.equal(outcome.candidateId, null);
  });
});
