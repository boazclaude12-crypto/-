import { getDb } from '../db/index';
import { repos } from '../db/repos';
import { nowIso } from '../time';
import { emitEvent, EVENT_TYPES } from './events';
import { markContacted } from './candidates';
import { getChannel } from '../integrations/index';
import { cancelPendingRuns } from '../automations/engine';
import { ApiError } from '../errors';
import type { MessageInput } from '../schemas';
import type { MessageRow } from '../types';

export interface MessageListItem extends MessageRow {
  candidate_name: string | null;
  client_name: string | null;
  job_title: string | null;
}

const LIST_SQL = `
  SELECT m.*,
         CASE WHEN c.id IS NULL THEN NULL ELSE (c.first_name || ' ' || c.last_name) END AS candidate_name,
         cl.name AS client_name, j.title AS job_title
    FROM messages m
    LEFT JOIN candidates c ON c.id = m.candidate_id
    LEFT JOIN clients cl ON cl.id = m.client_id
    LEFT JOIN jobs j ON j.id = m.job_id`;

export function listMessages(
  orgId: string,
  filters: { candidateId?: string; clientId?: string; status?: string; channel?: string; limit?: number } = {},
): MessageListItem[] {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (filters.candidateId) {
    clauses.push('m.candidate_id = ?');
    params.push(filters.candidateId);
  }
  if (filters.clientId) {
    clauses.push('m.client_id = ?');
    params.push(filters.clientId);
  }
  if (filters.status) {
    clauses.push('m.status = ?');
    params.push(filters.status);
  }
  if (filters.channel) {
    clauses.push('m.channel = ?');
    params.push(filters.channel);
  }
  return getDb().all<MessageListItem>(
    `${LIST_SQL} WHERE m.org_id = ? ${clauses.length ? `AND ${clauses.join(' AND ')}` : ''}
      ORDER BY m.created_at DESC LIMIT ?`,
    orgId, ...params, filters.limit ?? 100,
  );
}

function recipientFor(orgId: string, input: MessageInput): string | null {
  if (input.candidate_id) {
    const candidate = repos.candidates.find(orgId, input.candidate_id);
    if (!candidate) throw new ApiError(404, 'מועמד לא נמצא');
    return input.channel === 'email' ? candidate.email : candidate.whatsapp ?? candidate.phone;
  }
  if (input.client_contact_id) {
    const contact = repos.clientContacts.find(orgId, input.client_contact_id);
    return input.channel === 'email' ? contact?.email ?? null : contact?.phone ?? null;
  }
  if (input.client_id) {
    const client = repos.clients.find(orgId, input.client_id);
    return input.channel === 'email' ? client?.email ?? null : client?.phone ?? null;
  }
  return null;
}

/**
 * Records a message and — when asked to send and a provider is configured — hands it
 * to the channel. With no provider connected the row is stored with status `draft`
 * and the caller is told why, rather than being shown a fake "sent".
 */
export async function createMessage(
  orgId: string,
  userId: string,
  input: MessageInput,
): Promise<{ message: MessageRow; delivery: { delivered: boolean; reason?: string } }> {
  const to = recipientFor(orgId, input);

  let message = repos.messages.create(orgId, {
    channel: input.channel,
    direction: 'out',
    candidate_id: input.candidate_id ?? null,
    client_id: input.client_id ?? null,
    client_contact_id: input.client_contact_id ?? null,
    job_id: input.job_id ?? null,
    to_address: to,
    subject: input.subject ?? null,
    body: input.body,
    status: 'draft',
  });

  let delivery: { delivered: boolean; reason?: string } = { delivered: false };

  const sendableChannel =
    input.channel === 'whatsapp' || input.channel === 'sms' || input.channel === 'email'
      ? input.channel
      : null;

  if (input.send && sendableChannel) {
    if (!to) throw new ApiError(400, 'אין פרטי קשר מתאימים לערוץ שנבחר');
    const channel = getChannel(sendableChannel);
    const result = await channel.send({ to, body: input.body, subject: input.subject ?? undefined });
    delivery = { delivered: result.delivered, reason: result.reason };
    message = repos.messages.update(orgId, message.id, {
      status: result.delivered ? 'sent' : 'draft',
      provider: result.provider,
      provider_message_id: result.providerMessageId ?? null,
      error: result.delivered ? null : result.reason ?? null,
      sent_at: result.delivered ? nowIso() : null,
    })!;
  }

  // Manual channels ("call", "note") are logged as having happened.
  if (input.channel === 'call' || input.channel === 'note') {
    message = repos.messages.update(orgId, message.id, { status: 'sent', sent_at: nowIso() })!;
    delivery = { delivered: true };
  }

  if (message.status === 'sent') {
    if (message.candidate_id) markContacted(orgId, message.candidate_id);
    emitEvent(orgId, {
      type: EVENT_TYPES.messageSent,
      candidateId: message.candidate_id,
      clientId: message.client_id,
      jobId: message.job_id,
      actorUserId: userId,
      summary: `נשלחה הודעה (${message.channel})${message.subject ? `: ${message.subject}` : ''}`,
      meta: { channel: message.channel, audience: message.candidate_id ? 'candidate' : 'client' },
    });
  }
  return { message, delivery };
}

/** Marks an outbound message as answered and cancels the scheduled chase-up. */
export function recordInboundReply(orgId: string, userId: string, candidateId: string, body: string): MessageRow {
  const message = repos.messages.create(orgId, {
    channel: 'whatsapp',
    direction: 'in',
    candidate_id: candidateId,
    body,
    status: 'read',
    sent_at: nowIso(),
  });
  markContacted(orgId, candidateId);
  cancelPendingRuns(orgId, { entityId: candidateId, triggerEvent: EVENT_TYPES.messageSent });
  emitEvent(orgId, {
    type: 'message.received',
    candidateId,
    actorUserId: userId,
    summary: 'התקבלה תשובה מהמועמד',
  });
  return message;
}

export function deleteMessage(orgId: string, messageId: string): boolean {
  return repos.messages.remove(orgId, messageId);
}
