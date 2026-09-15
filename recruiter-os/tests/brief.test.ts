import './setup';
import { createOrg } from './setup';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildBrief, renderBrief } from '../src/lib/email/brief';
import { createCandidate } from '../src/lib/domain/candidates';
import { createTask } from '../src/lib/domain/tasks';

describe('the daily brief', () => {
  test('a quiet desk produces no mail at all', async () => {
    const { orgId } = await createOrg();
    const brief = buildBrief(orgId);
    // A daily message saying "nothing today" teaches the reader to stop opening it.
    assert.equal(brief.hasAnything, false);
  });

  test('an overdue task is something to report', async () => {
    const { orgId, userId } = await createOrg();
    createTask(orgId, userId, {
      title: 'להתקשר לדני',
      due_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      priority: 'high',
    } as never);

    const brief = buildBrief(orgId);
    assert.equal(brief.hasAnything, true);
    assert.ok(brief.actions.some((action) => action.kind === 'task_overdue'), JSON.stringify(brief.actions));
  });

  test('candidates that arrived overnight are counted', async () => {
    const { orgId, userId } = await createOrg();
    createCandidate(orgId, userId, { first_name: 'דני', phone: '0521234567' } as never);
    assert.equal(buildBrief(orgId).newCandidates, 1);
  });

  test('renders both an HTML and a plain-text body', async () => {
    const { orgId, userId } = await createOrg();
    createTask(orgId, userId, {
      title: 'לחזור ללקוח',
      due_at: new Date(Date.now() - 86_400_000).toISOString(),
      priority: 'normal',
    } as never);

    const mail = renderBrief(buildBrief(orgId), { to: 'me@example.com', baseUrl: 'https://desk.example.com' });
    assert.equal(mail.to, 'me@example.com');
    assert.ok(mail.subject.includes('הבוקר שלך'));
    assert.ok(mail.html.includes('dir="rtl"'), 'Hebrew mail must declare its direction');
    // Mail clients strip stylesheets, so every rule has to be inline.
    assert.ok(!mail.html.includes('<style'), 'no stylesheet — Gmail removes it');
    assert.ok(mail.html.includes('https://desk.example.com/'), 'links must be absolute');
    assert.ok(mail.text.includes('לחזור ללקוח'), 'the text part carries the same items');
  });

  test('escapes content that would otherwise break the markup', async () => {
    const { orgId, userId } = await createOrg();
    createTask(orgId, userId, {
      title: '<script>alert(1)</script> ולבדוק',
      due_at: new Date(Date.now() - 86_400_000).toISOString(),
      priority: 'normal',
    } as never);

    const mail = renderBrief(buildBrief(orgId), { to: 'me@example.com', baseUrl: 'https://x.test' });
    assert.ok(!mail.html.includes('<script>'), 'a task title is data, never markup');
    assert.ok(mail.html.includes('&lt;script&gt;'));
  });
});

describe('subject line wording', () => {
  test('a single item is not written as a plural', async () => {
    const { orgId, userId } = await createOrg();
    const { createTask } = await import('../src/lib/domain/tasks');
    createTask(orgId, userId, {
      title: 'משימה אחת',
      due_at: new Date(Date.now() - 86_400_000).toISOString(),
      priority: 'normal',
    } as never);

    const mail = renderBrief(buildBrief(orgId), { to: 'x@y.z', baseUrl: 'https://x.test' });
    assert.ok(mail.subject.includes('דבר אחד לטפל בו'), mail.subject);
    assert.ok(!/\b1 דברים/.test(mail.subject), mail.subject);
  });
});
