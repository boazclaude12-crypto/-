import './setup';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntakeEmail } from '../src/lib/ai/email-intake';

/** Verbatim shape of a real AllJobs notification, pipes and all. */
function allJobsBody(fields: { name: string; city?: string; phone: string; job: string; jobId?: string }) {
  return `| |
| |
| שלום רב, |
| ממש עכשיו קיבלת קורות חיים חדשים למשרת: |
| "${fields.job}" |
| קורות החיים של המועמד מצורפים למייל זה. |

| |
| שם המועמד: ${fields.name} |
${fields.city ? `| מגורים: ${fields.city} |\n` : ''}| טלפון: ${fields.phone} |

| להפסקת פרסום המשרה - לחץ כאן[](https://www.alljobs.co.il/Employer/MakorRemoveJobThanksPage.aspx?JobID=${fields.jobId ?? '8792573'}&JobKey=MDMQ1RrS0ow=) |
| נשמח לעמוד לרשותך - במייל[](https://www.alljobs.co.il/ContactUs.aspx?dep=1) |`;
}

describe('job-board application emails', () => {
  test('reads name, town, phone and the job applied for', () => {
    const result = parseIntakeEmail({
      from: 'alljobs@alljob.co.il',
      subject: 'מועמדות חדשה מבכר טל למשרת עובד כללי',
      body: allJobsBody({ name: 'טל בכר', city: 'הרצליה', phone: '052-4080248', job: 'עובד כללי' }),
    });
    assert.equal(result.source, 'alljobs');
    assert.equal(result.first_name, 'טל');
    assert.equal(result.last_name, 'בכר');
    assert.equal(result.city, 'הרצליה');
    assert.equal(result.phone, '+972524080248');
    assert.equal(result.job_title, 'עובד כללי');
    assert.equal(result.external_ref, 'alljobs:8792573');
  });

  test('a missing town is left null rather than guessed', () => {
    const result = parseIntakeEmail({
      from: 'alljobs@alljob.co.il',
      subject: 'מועמדות חדשה מAttie Isaac למשרת מחסנאים',
      body: allJobsBody({ name: 'Isaac Attie', phone: '0524985654', job: 'מחסנאים' }),
    });
    assert.equal(result.city, null);
    assert.equal(result.first_name, 'Isaac');
    assert.equal(result.job_title, 'מחסנאים');
  });

  test('a multi-word surname survives intact', () => {
    const result = parseIntakeEmail({
      from: 'alljobs@alljob.co.il',
      body: allJobsBody({ name: 'אנדרס דה לה רוסה', city: 'רמת גן', phone: '058-6609623', job: 'עובד כללי' }),
    });
    assert.equal(result.first_name, 'אנדרס');
    assert.equal(result.last_name, 'דה לה רוסה');
  });

  test("the board's own address is never taken for the candidate's", () => {
    const result = parseIntakeEmail({
      from: 'alljobs@alljob.co.il',
      body: allJobsBody({ name: 'ערן ברוך', city: 'תל מונד', phone: '0504050773', job: 'נהגי 12 טון' }),
    });
    assert.equal(result.email, null);
  });

  test('a direct application still yields a phone, and admits it read little', () => {
    const result = parseIntakeEmail({
      from: 'levi.shai2@gmail.com',
      subject: 'שולח לכם את קורות חיי .',
      body: 'אני פונה למשרת אחראי מחסן לוגיסטי. הטלפון שלי 050-1112233. בברכה שי לוי.',
    });
    assert.equal(result.source, 'generic');
    assert.equal(result.phone, '+972501112233');
    assert.equal(result.first_name, null, 'a name must not be invented from free text');
  });
});
