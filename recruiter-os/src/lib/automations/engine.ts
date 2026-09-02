import { repos } from '../db/repos';
import { logActivity } from '../domain/activity';
import { getDb } from '../db/index';
import { isoPlus, nowIso, MINUTE } from '../time';
import type { AutomationRow, AutomationRunRow } from '../types';

export interface AutomationEvent {
  type: string;
  candidateId?: string | null;
  clientId?: string | null;
  jobId?: string | null;
  applicationId?: string | null;
  placementId?: string | null;
  meta?: Record<string, unknown>;
}

export interface RunPayload extends AutomationEvent {
  meta: Record<string, unknown>;
}

/** What an automation is allowed to do. Adding an action = adding one case here. */
export type ActionType = 'create_task' | 'draft_message' | 'create_reminder';

interface CreateTaskConfig {
  title: string;
  details?: string;
  priority?: string;
  dueInMinutes?: number;
  link?: 'candidate' | 'client' | 'job' | 'application';
}

interface DraftMessageConfig {
  channel: string;
  subject?: string;
  body: string;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Conditions are a flat equality map checked against the event meta. */
function conditionsMatch(conditions: Record<string, unknown>, event: AutomationEvent): boolean {
  const meta = event.meta ?? {};
  for (const [key, expected] of Object.entries(conditions)) {
    const actual = (meta as Record<string, unknown>)[key];
    if (Array.isArray(expected)) {
      if (!expected.includes(actual as string)) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

interface TemplateContext {
  candidate: string;
  job: string;
  client: string;
  stage: string;
}

function buildContext(orgId: string, event: AutomationEvent): TemplateContext {
  const candidate = event.candidateId ? repos.candidates.find(orgId, event.candidateId) : undefined;
  const job = event.jobId ? repos.jobs.find(orgId, event.jobId) : undefined;
  const clientId = event.clientId ?? job?.client_id ?? null;
  const client = clientId ? repos.clients.find(orgId, clientId) : undefined;
  return {
    candidate: candidate ? `${candidate.first_name} ${candidate.last_name}`.trim() : '',
    job: job?.title ?? '',
    client: client?.name ?? '',
    stage: String(event.meta?.stage_key ?? ''),
  };
}

export function renderTemplate(template: string, context: TemplateContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = (context as unknown as Record<string, string>)[key];
    return value ?? '';
  });
}

/**
 * Entry point called by `emitEvent`. Immediate rules run inline; delayed ones are
 * persisted as pending runs and executed later by `processDueRuns`.
 */
export function dispatchAutomations(orgId: string, event: AutomationEvent): void {
  const automations = repos.automations.list(orgId, {
    where: 'trigger_event = ? AND is_enabled = 1',
    params: [event.type],
    orderBy: 'created_at ASC',
  });
  if (automations.length === 0) return;

  for (const automation of automations) {
    if (!conditionsMatch(parseJson<Record<string, unknown>>(automation.conditions, {}), event)) continue;

    const runAt = automation.delay_minutes > 0 ? isoPlus(automation.delay_minutes * MINUTE) : nowIso();
    const run = repos.automationRuns.create(orgId, {
      automation_id: automation.id,
      trigger_event: event.type,
      entity_type: entityTypeOf(event),
      entity_id: primaryEntityId(event),
      payload: JSON.stringify(event),
      status: 'pending',
      run_at: runAt,
    });

    if (automation.delay_minutes === 0) executeRun(orgId, run, automation);
  }
}

function entityTypeOf(event: AutomationEvent): string {
  if (event.applicationId) return 'application';
  if (event.candidateId) return 'candidate';
  if (event.jobId) return 'job';
  if (event.clientId) return 'client';
  return 'org';
}

function primaryEntityId(event: AutomationEvent): string | null {
  return event.applicationId ?? event.candidateId ?? event.jobId ?? event.clientId ?? null;
}

function executeRun(orgId: string, run: AutomationRunRow, automation: AutomationRow): void {
  const event = parseJson<AutomationEvent>(run.payload, { type: run.trigger_event });
  try {
    const context = buildContext(orgId, event);
    const result = performAction(orgId, automation, event, context);
    repos.automationRuns.update(orgId, run.id, {
      status: 'done',
      executed_at: nowIso(),
      result: JSON.stringify(result),
    });
    logActivity(orgId, {
      type: 'automation.ran',
      actor: 'automation',
      candidateId: event.candidateId ?? null,
      clientId: event.clientId ?? null,
      jobId: event.jobId ?? null,
      applicationId: event.applicationId ?? null,
      summary: `אוטומציה הופעלה: ${automation.name}`,
      meta: { automation: automation.key, ...result },
    });
  } catch (error) {
    repos.automationRuns.update(orgId, run.id, {
      status: 'failed',
      executed_at: nowIso(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function performAction(
  orgId: string,
  automation: AutomationRow,
  event: AutomationEvent,
  context: TemplateContext,
): Record<string, unknown> {
  const action = automation.action_type as ActionType;

  if (action === 'create_task' || action === 'create_reminder') {
    const config = parseJson<CreateTaskConfig>(automation.action_config, { title: automation.name });
    const dueAt = isoPlus((config.dueInMinutes ?? 0) * MINUTE);
    const task = repos.tasks.create(orgId, {
      title: renderTemplate(config.title, context),
      details: config.details ? renderTemplate(config.details, context) : null,
      due_at: dueAt,
      remind_at: action === 'create_reminder' ? dueAt : null,
      priority: config.priority ?? 'normal',
      status: 'open',
      candidate_id: event.candidateId ?? null,
      client_id: event.clientId ?? null,
      job_id: event.jobId ?? null,
      application_id: event.applicationId ?? null,
      created_by: 'automation',
      automation_id: automation.id,
    });
    return { taskId: task.id, title: task.title };
  }

  if (action === 'draft_message') {
    const config = parseJson<DraftMessageConfig>(automation.action_config, { channel: 'whatsapp', body: '' });
    const candidate = event.candidateId ? repos.candidates.find(orgId, event.candidateId) : undefined;
    const message = repos.messages.create(orgId, {
      channel: config.channel,
      direction: 'out',
      candidate_id: event.candidateId ?? null,
      client_id: event.clientId ?? null,
      job_id: event.jobId ?? null,
      to_address: candidate?.whatsapp ?? candidate?.phone ?? null,
      subject: config.subject ? renderTemplate(config.subject, context) : null,
      body: renderTemplate(config.body, context),
      status: 'draft',
    });
    return { messageId: message.id };
  }

  throw new Error(`Unsupported automation action: ${automation.action_type}`);
}

/** Runs every pending automation whose scheduled time has arrived. */
export function processDueRuns(orgId: string, limit = 100): { executed: number; failed: number } {
  const due = repos.automationRuns.list(orgId, {
    where: 'status = ? AND run_at <= ?',
    params: ['pending', nowIso()],
    orderBy: 'run_at ASC',
    limit,
  });

  let executed = 0;
  let failed = 0;
  for (const run of due) {
    const automation = repos.automations.find(orgId, run.automation_id);
    if (!automation || automation.is_enabled === 0) {
      repos.automationRuns.update(orgId, run.id, { status: 'skipped', executed_at: nowIso() });
      continue;
    }
    executeRun(orgId, run, automation);
    const after = repos.automationRuns.find(orgId, run.id);
    if (after?.status === 'done') executed += 1;
    else failed += 1;
  }
  return { executed, failed };
}

/**
 * Cancels scheduled follow-ups that are no longer needed — e.g. the candidate replied
 * before the 24-hour chase-up fired.
 */
export function cancelPendingRuns(
  orgId: string,
  filter: { entityId?: string | null; triggerEvent?: string },
): number {
  const clauses = ['status = ?'];
  const params: string[] = ['pending'];
  if (filter.entityId) {
    clauses.push('entity_id = ?');
    params.push(filter.entityId);
  }
  if (filter.triggerEvent) {
    clauses.push('trigger_event = ?');
    params.push(filter.triggerEvent);
  }
  return getDb().run(
    `UPDATE automation_runs SET status = 'cancelled', executed_at = ?
      WHERE org_id = ? AND ${clauses.join(' AND ')}`,
    nowIso(),
    orgId,
    ...params,
  ).changes;
}
