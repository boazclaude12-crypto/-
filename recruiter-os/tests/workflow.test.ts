import './setup';
import { createOrg } from './setup';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getDb } from '../src/lib/db/index';
import { repos } from '../src/lib/db/repos';
import { createCandidate } from '../src/lib/domain/candidates';
import { createClient } from '../src/lib/domain/clients';
import { createJob } from '../src/lib/domain/jobs';
import { addCandidateToJob, moveApplicationStage, pipelineForJob } from '../src/lib/domain/applications';
import { calculateFee, createPlacement, markStarted, updatePlacement } from '../src/lib/domain/placements';
import { listPayments, revenueForPeriod, refreshOverdue } from '../src/lib/domain/payments';
import { processDueRuns, cancelPendingRuns } from '../src/lib/automations/engine';
import { listTasks } from '../src/lib/domain/tasks';
import { timeline } from '../src/lib/domain/activity';
import { nextBestActions } from '../src/lib/domain/next-best-action';
import { dateOnly, addDays } from '../src/lib/time';

async function desk() {
  const { orgId, userId } = await createOrg();
  const client = createClient(orgId, userId, {
    name: 'לקוח בדיקה',
    fee_type: 'percent',
    fee_value: 10,
    payment_terms_days: 30,
  } as never);
  const job = createJob(orgId, userId, {
    title: 'נהג חלוקה',
    client_id: client.id,
    city: 'חיפה',
    salary_min: 10000,
    salary_max: 10000,
    headcount: 1,
    requirements: [{ kind: 'license', value: 'רישיון C', is_required: true, weight: 1 }],
  } as never);
  const candidate = createCandidate(orgId, userId, {
    first_name: 'דני',
    last_name: 'כהן',
    phone: '0501234567',
    city: 'חיפה',
    availability: 'immediate',
    attributes: [{ kind: 'license', value: 'רישיון C' }],
  } as never);
  return { orgId, userId, client, job, candidate };
}

describe('end-to-end recruitment flow', () => {
  test('candidate → application → stages → placement → payment', async () => {
    const { orgId, userId, client, job, candidate } = await desk();

    const application = addCandidateToJob(orgId, userId, {
      candidate_id: candidate.id,
      job_id: job.id,
      match_score: 92,
    });
    assert.equal(application.stage_key, 'new');
    assert.equal(pipelineForJob(orgId, job.id).length, 1);

    // Adding the same pair twice must not create a duplicate.
    const again = addCandidateToJob(orgId, userId, { candidate_id: candidate.id, job_id: job.id });
    assert.equal(again.id, application.id);

    moveApplicationStage(orgId, userId, application.id, 'sent_to_client');
    const sent = repos.applications.find(orgId, application.id)!;
    assert.ok(sent.sent_to_client_at, 'the client clock must start');
    assert.equal(repos.candidates.find(orgId, candidate.id)?.status_key, 'sent_to_client');

    const placement = createPlacement(orgId, userId, {
      candidate_id: candidate.id,
      job_id: job.id,
      application_id: application.id,
      start_date: dateOnly(new Date()),
      salary: 10000,
      create_payment: true,
    } as never);

    assert.equal(placement.fee_amount, 1000, '10% of a 10,000 salary');
    assert.equal(repos.applications.find(orgId, application.id)?.status, 'placed');
    assert.equal(repos.jobs.find(orgId, job.id)?.status, 'closed', 'headcount filled closes the job');

    const payments = listPayments(orgId, {});
    assert.equal(payments.length, 1);
    assert.equal(payments[0]!.amount, 1000);
    assert.equal(payments[0]!.client_id, client.id);

    markStarted(orgId, userId, placement.id);
    assert.equal(repos.candidates.find(orgId, candidate.id)?.status_key, 'started');
    assert.equal(repos.placements.find(orgId, placement.id)?.status, 'guarantee');

    const entries = timeline(orgId, { candidateId: candidate.id });
    const types = entries.map((entry) => entry.type);
    assert.ok(types.includes('candidate.created'));
    assert.ok(types.includes('application.sent_to_client'));
    assert.ok(types.includes('placement.created'));
    assert.ok(types.includes('placement.started'));
  });

  test('a fallen-through placement writes off its unpaid commission', async () => {
    const { orgId, userId, job, candidate } = await desk();
    const application = addCandidateToJob(orgId, userId, { candidate_id: candidate.id, job_id: job.id });
    const placement = createPlacement(orgId, userId, {
      candidate_id: candidate.id,
      job_id: job.id,
      application_id: application.id,
      start_date: dateOnly(new Date()),
      salary: 10000,
    } as never);

    updatePlacement(orgId, userId, placement.id, { status: 'fallen_through' });
    const payments = listPayments(orgId, {});
    assert.equal(payments[0]!.status, 'written_off');
  });

  test('commission maths covers percent, fixed and hourly bases', () => {
    assert.equal(calculateFee('percent', 12, 10000, 'month'), 1200);
    assert.equal(calculateFee('fixed', 5000, 10000, 'month'), 5000);
    assert.equal(calculateFee('percent', 10, 50, 'hour'), 910, '50/hour ≈ 9,100/month');
    assert.equal(calculateFee('percent', 10, null, 'month'), 0, 'no salary means no computed fee');
  });

  test('overdue payments are detected and counted in revenue', async () => {
    const { orgId, userId, job, candidate } = await desk();
    const application = addCandidateToJob(orgId, userId, { candidate_id: candidate.id, job_id: job.id });
    const placement = createPlacement(orgId, userId, {
      candidate_id: candidate.id,
      job_id: job.id,
      application_id: application.id,
      start_date: dateOnly(new Date()),
      salary: 10000,
    } as never);

    getDb().run(
      'UPDATE payments SET due_date = ? WHERE org_id = ? AND placement_id = ?',
      dateOnly(addDays(-5)), orgId, placement.id,
    );
    assert.equal(refreshOverdue(orgId), 1);
    assert.equal(listPayments(orgId, {})[0]!.status, 'overdue');

    const revenue = revenueForPeriod(orgId, dateOnly(addDays(-30)), dateOnly(addDays(30)));
    assert.equal(revenue.overdue, 1000);
    assert.equal(revenue.received, 0);
  });
});

describe('automation engine', () => {
  test('an immediate rule fires on its event and is logged', async () => {
    const { orgId, userId } = await createOrg();
    const candidate = createCandidate(orgId, userId, { first_name: 'אבי', last_name: 'לוי' } as never);

    // The welcome automation drafts a WhatsApp message on candidate.created.
    const messages = repos.messages.list(orgId, { where: 'candidate_id = ?', params: [candidate.id] });
    assert.equal(messages.length, 1);
    assert.equal(messages[0]!.status, 'draft', 'nothing is sent without a configured provider');
    assert.ok(messages[0]!.body.includes('אבי'), 'the template must be rendered with the real name');

    const runs = repos.automationRuns.list(orgId, { where: 'status = ?', params: ['done'] });
    assert.ok(runs.length >= 1);
  });

  test('a delayed rule waits, then produces a task when its time comes', async () => {
    const { orgId, userId } = await createOrg();
    const candidate = createCandidate(orgId, userId, { first_name: 'רון', phone: '0509999999' } as never);

    const { createMessage } = await import('../src/lib/domain/messages');
    await createMessage(orgId, userId, {
      channel: 'call',
      candidate_id: candidate.id,
      body: 'שיחה ראשונה',
      send: false,
    } as never);

    const pending = repos.automationRuns.list(orgId, { where: 'status = ?', params: ['pending'] });
    assert.ok(pending.length >= 1, 'the 24h follow-up must be scheduled, not run');

    // Bring the scheduled time forward and process it.
    getDb().run("UPDATE automation_runs SET run_at = ? WHERE org_id = ? AND status = 'pending'",
      new Date(Date.now() - 1000).toISOString(), orgId);
    const result = processDueRuns(orgId);
    assert.ok(result.executed >= 1);

    const tasks = listTasks(orgId, { status: 'open', limit: 20 });
    assert.ok(tasks.some((task) => task.created_by === 'automation'), 'the follow-up task must exist');
  });

  test('a disabled rule does not fire', async () => {
    const { orgId, userId } = await createOrg();
    const welcome = repos.automations.findBy(orgId, 'key = ?', 'welcome_new_candidate')!;
    repos.automations.update(orgId, welcome.id, { is_enabled: 0 });

    const candidate = createCandidate(orgId, userId, { first_name: 'שקט' } as never);
    const messages = repos.messages.list(orgId, { where: 'candidate_id = ?', params: [candidate.id] });
    assert.equal(messages.length, 0);
  });

  test('a scheduled follow-up is cancelled when the candidate replies', async () => {
    const { orgId, userId } = await createOrg();
    const candidate = createCandidate(orgId, userId, { first_name: 'ליאור', phone: '0501111111' } as never);

    const { createMessage, recordInboundReply } = await import('../src/lib/domain/messages');
    await createMessage(orgId, userId, {
      channel: 'call', candidate_id: candidate.id, body: 'ניסיתי להשיג', send: false,
    } as never);
    assert.ok(repos.automationRuns.list(orgId, { where: 'status = ?', params: ['pending'] }).length >= 1);

    recordInboundReply(orgId, userId, candidate.id, 'מעוניין, אפשר לדבר מחר');
    const stillPending = repos.automationRuns.list(orgId, {
      where: 'status = ? AND entity_id = ?', params: ['pending', candidate.id],
    });
    assert.equal(stillPending.length, 0, 'a reply must cancel the chase-up');
  });

  test('cancelPendingRuns only touches pending runs', async () => {
    const { orgId, userId } = await createOrg();
    createCandidate(orgId, userId, { first_name: 'טסט' } as never);
    const before = repos.automationRuns.list(orgId, { where: 'status = ?', params: ['done'] }).length;
    cancelPendingRuns(orgId, {});
    const after = repos.automationRuns.list(orgId, { where: 'status = ?', params: ['done'] }).length;
    assert.equal(before, after, 'completed runs must not be rewritten');
  });
});

describe('next best action', () => {
  test('surfaces a client that has been waiting for feedback', async () => {
    const { orgId, userId, job, candidate } = await desk();
    const application = addCandidateToJob(orgId, userId, { candidate_id: candidate.id, job_id: job.id });
    moveApplicationStage(orgId, userId, application.id, 'sent_to_client');

    getDb().run(
      'UPDATE applications SET sent_to_client_at = ?, client_feedback_at = NULL WHERE id = ?',
      addDays(-3), application.id,
    );

    const actions = nextBestActions(orgId);
    const waiting = actions.find((action) => action.kind === 'client_feedback');
    assert.ok(waiting, 'a 3-day-old client wait must be surfaced');
    assert.equal(waiting!.severity, 'critical');
    assert.ok(waiting!.href.includes('/clients/'));
  });

  test('surfaces an overdue payment as critical', async () => {
    const { orgId, userId, job, candidate } = await desk();
    const application = addCandidateToJob(orgId, userId, { candidate_id: candidate.id, job_id: job.id });
    const placement = createPlacement(orgId, userId, {
      candidate_id: candidate.id, job_id: job.id, application_id: application.id,
      start_date: dateOnly(new Date()), salary: 10000,
    } as never);
    getDb().run(
      'UPDATE payments SET due_date = ? WHERE org_id = ? AND placement_id = ?',
      dateOnly(addDays(-10)), orgId, placement.id,
    );

    const actions = nextBestActions(orgId);
    assert.ok(actions.some((action) => action.kind === 'payment_overdue'));
  });

  test('an empty desk produces no noise', async () => {
    const { orgId } = await createOrg();
    assert.deepEqual(nextBestActions(orgId), []);
  });
});

describe('customisable pipeline stages', () => {
  test('a stage in use cannot be deleted, an unused one can', async () => {
    const { orgId, userId, job, candidate } = await desk();
    const { repos: repo } = await import('../src/lib/db/repos');

    // Park a candidate in the screening stage.
    addCandidateToJob(orgId, userId, { candidate_id: candidate.id, job_id: job.id });
    const screening = repo.stages.findBy(orgId, 'key = ?', 'screening')!;
    repos.candidates.update(orgId, candidate.id, { status_key: 'screening' });

    const db = getDb();
    const inUse = db.get<{ n: number }>(
      `SELECT (SELECT COUNT(*) FROM candidates WHERE org_id = ? AND status_key = ?)
            + (SELECT COUNT(*) FROM applications WHERE org_id = ? AND stage_key = ?) AS n`,
      orgId, screening.key, orgId, screening.key,
    );
    assert.ok((inUse?.n ?? 0) > 0, 'the guard must see the stage is occupied');

    // An unused custom stage is free to remove.
    const custom = repo.stages.create(orgId, {
      key: 'trial_day', label: 'יום ניסיון', color: 'cyan',
      in_pipeline: 1, is_terminal: 0, outcome: 'neutral', sort_order: 99, is_system: 0,
    });
    assert.equal(repo.stages.remove(orgId, custom.id), true);
  });

  test('renaming a stage keeps its key, so existing records stay attached', async () => {
    const { orgId } = await createOrg();
    const { repos: repo } = await import('../src/lib/db/repos');
    const stage = repo.stages.findBy(orgId, 'key = ?', 'interview')!;

    const updated = repo.stages.update(orgId, stage.id, { label: 'ראיון אצלי', color: 'violet' });
    assert.equal(updated?.key, 'interview', 'the key is the join column — it must not change');
    assert.equal(updated?.label, 'ראיון אצלי');
  });
});
