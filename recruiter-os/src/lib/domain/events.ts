import { logActivity, type ActivityInput } from './activity';
import { dispatchAutomations } from '../automations/engine';
import type { ActivityEventRow } from '../types';

/** Every domain event the app can raise. Automations subscribe to these keys. */
export const EVENT_TYPES = {
  candidateCreated: 'candidate.created',
  candidateUpdated: 'candidate.updated',
  candidateStatusChanged: 'candidate.status_changed',
  candidateContacted: 'candidate.contacted',
  candidateNoResponse: 'candidate.no_response',
  cvUploaded: 'candidate.cv_uploaded',
  applicationCreated: 'application.created',
  applicationStageChanged: 'application.stage_changed',
  applicationSentToClient: 'application.sent_to_client',
  applicationRejected: 'application.rejected',
  interviewScheduled: 'interview.scheduled',
  interviewCompleted: 'interview.completed',
  jobCreated: 'job.created',
  jobClosed: 'job.closed',
  clientCreated: 'client.created',
  messageSent: 'message.sent',
  noteAdded: 'note.added',
  taskCreated: 'task.created',
  taskCompleted: 'task.completed',
  placementCreated: 'placement.created',
  candidateStartedWork: 'placement.started',
  paymentReceived: 'payment.received',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

export interface DomainEventInput extends Omit<ActivityInput, 'type'> {
  type: EventType | string;
}

/**
 * Records the event on the timeline and hands it to the automation engine.
 * All state-changing services call this instead of writing activity rows directly.
 */
export function emitEvent(orgId: string, event: DomainEventInput): ActivityEventRow {
  const row = logActivity(orgId, event);
  try {
    dispatchAutomations(orgId, {
      type: event.type,
      candidateId: event.candidateId ?? null,
      clientId: event.clientId ?? null,
      jobId: event.jobId ?? null,
      applicationId: event.applicationId ?? null,
      placementId: event.placementId ?? null,
      meta: event.meta ?? {},
    });
  } catch (error) {
    // An automation must never break the user's action; the failure is recorded per-run.
    console.error('[automations] dispatch failed', error);
  }
  return row;
}
