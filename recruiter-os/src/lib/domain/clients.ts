import { getDb } from '../db/index';
import { repos } from '../db/repos';
import { normalizePhone } from '../text';
import { emitEvent, EVENT_TYPES } from './events';
import { timeline } from './activity';
import type { ClientInput } from '../schemas';
import type { ClientContactRow, ClientRow } from '../types';

export interface ClientListItem extends ClientRow {
  open_jobs: number;
  active_candidates: number;
  placements: number;
  revenue_paid: number;
  revenue_pending: number;
  primary_contact: string | null;
}

const LIST_SQL = `
  SELECT c.*,
         (SELECT COUNT(*) FROM jobs j WHERE j.client_id = c.id AND j.status IN ('open','sourcing')) AS open_jobs,
         (SELECT COUNT(*) FROM applications a JOIN jobs j ON j.id = a.job_id
           WHERE j.client_id = c.id AND a.status = 'active') AS active_candidates,
         (SELECT COUNT(*) FROM placements p WHERE p.client_id = c.id AND p.status != 'fallen_through') AS placements,
         COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.client_id = c.id AND p.status = 'paid'), 0) AS revenue_paid,
         COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.client_id = c.id AND p.status IN ('expected','invoiced','overdue')), 0) AS revenue_pending,
         (SELECT cc.name FROM client_contacts cc WHERE cc.client_id = c.id ORDER BY cc.is_primary DESC, cc.created_at ASC LIMIT 1) AS primary_contact
    FROM clients c`;

function writeContacts(orgId: string, clientId: string, contacts: ClientInput['contacts']): void {
  if (!contacts) return;
  repos.clientContacts.removeBy(orgId, 'client_id = ?', clientId);
  contacts.forEach((contact, index) => {
    if (!contact.name.trim()) return;
    repos.clientContacts.create(orgId, {
      client_id: clientId,
      name: contact.name,
      role: contact.role ?? null,
      phone: contact.phone ? normalizePhone(contact.phone) : null,
      email: contact.email ?? null,
      is_primary: contact.is_primary || index === 0 ? 1 : 0,
      notes: contact.notes ?? null,
    });
  });
}

export function createClient(orgId: string, userId: string, input: ClientInput): ClientRow {
  const { contacts, ...rest } = input;
  const db = getDb();
  const client = db.transaction(() => {
    const created = repos.clients.create(orgId, {
      ...rest,
      phone: rest.phone ? normalizePhone(rest.phone) : null,
      fee_value: rest.fee_value ?? 12,
      payment_terms_days: rest.payment_terms_days ?? 30,
    });
    writeContacts(orgId, created.id, contacts);
    return repos.clients.find(orgId, created.id)!;
  });

  emitEvent(orgId, {
    type: EVENT_TYPES.clientCreated,
    clientId: client.id,
    actorUserId: userId,
    summary: `לקוח נוסף: ${client.name}`,
  });
  return client;
}

export function updateClient(
  orgId: string,
  userId: string,
  clientId: string,
  input: Partial<ClientInput>,
): ClientRow | undefined {
  const { contacts, ...rest } = input;
  if (!repos.clients.find(orgId, clientId)) return undefined;

  const db = getDb();
  const client = db.transaction(() => {
    repos.clients.update(orgId, clientId, {
      ...rest,
      phone: rest.phone ? normalizePhone(rest.phone) : rest.phone,
    });
    if (contacts) writeContacts(orgId, clientId, contacts);
    return repos.clients.find(orgId, clientId)!;
  });

  emitEvent(orgId, {
    type: 'client.updated',
    clientId,
    actorUserId: userId,
    summary: 'פרטי הלקוח עודכנו',
  });
  return client;
}

export function deleteClient(orgId: string, clientId: string): boolean {
  return repos.clients.remove(orgId, clientId);
}

export function listClients(
  orgId: string,
  filters: { q?: string; status?: string; limit?: number; offset?: number } = {},
): ClientListItem[] {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (filters.q) {
    clauses.push('(c.name LIKE ? OR c.city LIKE ? OR c.industry LIKE ?)');
    params.push(`%${filters.q}%`, `%${filters.q}%`, `%${filters.q}%`);
  }
  if (filters.status) {
    clauses.push('c.status = ?');
    params.push(filters.status);
  }
  return getDb().all<ClientListItem>(
    `${LIST_SQL} WHERE c.org_id = ? ${clauses.length ? `AND ${clauses.join(' AND ')}` : ''}
      ORDER BY open_jobs DESC, c.name ASC LIMIT ? OFFSET ?`,
    orgId, ...params, filters.limit ?? 50, filters.offset ?? 0,
  );
}

export interface ClientDetail {
  client: ClientListItem;
  contacts: ClientContactRow[];
  jobs: Array<{ id: string; title: string; status: string; active_candidates: number; opened_at: string }>;
  placements: Array<{
    id: string; candidate_name: string; job_title: string; start_date: string; fee_amount: number; status: string;
  }>;
  payments: Array<{ id: string; amount: number; status: string; due_date: string | null; invoice_number: string | null }>;
  pipeline: Array<{ stage_key: string; count: number }>;
  timeline: ReturnType<typeof timeline>;
}

export function getClientDetail(orgId: string, clientId: string): ClientDetail | null {
  const db = getDb();
  const client = db.get<ClientListItem>(`${LIST_SQL} WHERE c.org_id = ? AND c.id = ?`, orgId, clientId);
  if (!client) return null;

  return {
    client,
    contacts: repos.clientContacts.list(orgId, {
      where: 'client_id = ?', params: [clientId], orderBy: 'is_primary DESC, created_at ASC',
    }),
    jobs: db.all(
      `SELECT j.id, j.title, j.status, j.opened_at,
              (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id AND a.status = 'active') AS active_candidates
         FROM jobs j WHERE j.org_id = ? AND j.client_id = ?
         ORDER BY j.status = 'closed', j.opened_at DESC`,
      orgId, clientId,
    ),
    placements: db.all(
      `SELECT p.id, (cd.first_name || ' ' || cd.last_name) AS candidate_name, j.title AS job_title,
              p.start_date, p.fee_amount, p.status
         FROM placements p
         JOIN candidates cd ON cd.id = p.candidate_id
         JOIN jobs j ON j.id = p.job_id
        WHERE p.org_id = ? AND p.client_id = ?
        ORDER BY p.start_date DESC`,
      orgId, clientId,
    ),
    payments: db.all(
      `SELECT id, amount, status, due_date, invoice_number FROM payments
        WHERE org_id = ? AND client_id = ? ORDER BY COALESCE(due_date, created_at) DESC`,
      orgId, clientId,
    ),
    pipeline: db.all(
      `SELECT a.stage_key, COUNT(*) AS count
         FROM applications a JOIN jobs j ON j.id = a.job_id
        WHERE a.org_id = ? AND j.client_id = ? AND a.status = 'active'
        GROUP BY a.stage_key`,
      orgId, clientId,
    ),
    timeline: timeline(orgId, { clientId, limit: 40 }),
  };
}

/** Clients whose candidates were sent over and who have not responded yet. */
export function clientsAwaitingFeedback(orgId: string, hours = 24) {
  return getDb().all<{
    client_id: string; client_name: string; candidate_id: string; candidate_name: string;
    job_title: string; application_id: string; sent_to_client_at: string; hours_waiting: number;
  }>(
    `SELECT j.client_id, cl.name AS client_name, a.candidate_id,
            (c.first_name || ' ' || c.last_name) AS candidate_name,
            j.title AS job_title, a.id AS application_id, a.sent_to_client_at,
            CAST((julianday('now') - julianday(a.sent_to_client_at)) * 24 AS INTEGER) AS hours_waiting
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
       JOIN clients cl ON cl.id = j.client_id
       JOIN candidates c ON c.id = a.candidate_id
      WHERE a.org_id = ? AND a.status = 'active'
        AND a.sent_to_client_at IS NOT NULL AND a.client_feedback_at IS NULL
        AND (julianday('now') - julianday(a.sent_to_client_at)) * 24 >= ?
      ORDER BY hours_waiting DESC`,
    orgId, hours,
  );
}
