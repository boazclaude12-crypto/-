import { getDb } from '../db/index';
import { repos } from '../db/repos';
import { dateOnly, endOfMonth, nowIso, startOfMonth } from '../time';
import { emitEvent, EVENT_TYPES } from './events';
import type { z } from 'zod';
import type { paymentSchema } from '../schemas';
import type { PaymentRow } from '../types';

type PaymentInput = z.infer<typeof paymentSchema>;

export interface PaymentListItem extends PaymentRow {
  client_name: string;
  candidate_name: string | null;
  job_title: string | null;
  is_overdue: number;
}

const LIST_SQL = `
  SELECT pay.*, cl.name AS client_name,
         CASE WHEN c.id IS NULL THEN NULL ELSE (c.first_name || ' ' || c.last_name) END AS candidate_name,
         j.title AS job_title,
         CASE WHEN pay.status IN ('expected','invoiced') AND pay.due_date IS NOT NULL AND pay.due_date < ? THEN 1 ELSE 0 END AS is_overdue
    FROM payments pay
    JOIN clients cl ON cl.id = pay.client_id
    LEFT JOIN placements p ON p.id = pay.placement_id
    LEFT JOIN candidates c ON c.id = p.candidate_id
    LEFT JOIN jobs j ON j.id = p.job_id`;

export function listPayments(
  orgId: string,
  filters: { status?: string; clientId?: string; from?: string; to?: string; limit?: number } = {},
): PaymentListItem[] {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (filters.status) {
    clauses.push('pay.status = ?');
    params.push(filters.status);
  }
  if (filters.clientId) {
    clauses.push('pay.client_id = ?');
    params.push(filters.clientId);
  }
  if (filters.from) {
    clauses.push('COALESCE(pay.due_date, pay.created_at) >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    clauses.push('COALESCE(pay.due_date, pay.created_at) <= ?');
    params.push(filters.to);
  }
  return getDb().all<PaymentListItem>(
    `${LIST_SQL} WHERE pay.org_id = ? ${clauses.length ? `AND ${clauses.join(' AND ')}` : ''}
      ORDER BY pay.status = 'paid', COALESCE(pay.due_date, pay.created_at) ASC LIMIT ?`,
    dateOnly(new Date()), orgId, ...params, filters.limit ?? 200,
  );
}

export function createPayment(orgId: string, userId: string, input: PaymentInput): PaymentRow {
  const payment = repos.payments.create(orgId, {
    placement_id: input.placement_id ?? null,
    client_id: input.client_id,
    amount: input.amount,
    currency: 'ILS',
    status: input.status ?? 'expected',
    due_date: input.due_date ?? null,
    invoice_number: input.invoice_number ?? null,
    paid_at: input.paid_at ?? null,
    method: input.method ?? null,
    notes: input.notes ?? null,
  });
  emitEvent(orgId, {
    type: 'payment.created',
    clientId: payment.client_id,
    placementId: payment.placement_id,
    actorUserId: userId,
    summary: `נרשם תשלום צפוי: ₪${payment.amount.toLocaleString('he-IL')}`,
  });
  return payment;
}

export function updatePayment(
  orgId: string,
  userId: string,
  paymentId: string,
  input: Partial<PaymentInput>,
): PaymentRow | undefined {
  const before = repos.payments.find(orgId, paymentId);
  if (!before) return undefined;

  const values: Record<string, string | number | null> = { ...input } as Record<string, string | number | null>;
  if (input.status === 'paid' && !input.paid_at) values.paid_at = nowIso();
  if (input.status && input.status !== 'paid') values.paid_at = null;

  const payment = repos.payments.update(orgId, paymentId, values)!;

  if (input.status === 'paid' && before.status !== 'paid') {
    emitEvent(orgId, {
      type: EVENT_TYPES.paymentReceived,
      clientId: payment.client_id,
      placementId: payment.placement_id,
      actorUserId: userId,
      summary: `התקבל תשלום: ₪${payment.amount.toLocaleString('he-IL')}`,
      meta: { amount: payment.amount },
    });
  }
  return payment;
}

export function deletePayment(orgId: string, paymentId: string): boolean {
  return repos.payments.remove(orgId, paymentId);
}

/** Flags payments whose due date passed. Called whenever the money screens load. */
export function refreshOverdue(orgId: string): number {
  return getDb().run(
    `UPDATE payments SET status = 'overdue', updated_at = ?
      WHERE org_id = ? AND status IN ('expected','invoiced') AND due_date IS NOT NULL AND due_date < ?`,
    nowIso(), orgId, dateOnly(new Date()),
  ).changes;
}

export interface RevenueSummary {
  expected: number;
  received: number;
  pending: number;
  overdue: number;
  placements: number;
}

export function revenueForPeriod(orgId: string, from: string, to: string): RevenueSummary {
  const db = getDb();
  const money = db.get<{ expected: number; received: number; pending: number; overdue: number }>(
    `SELECT
       COALESCE(SUM(amount), 0) AS expected,
       COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS received,
       COALESCE(SUM(CASE WHEN status IN ('expected','invoiced') THEN amount ELSE 0 END), 0) AS pending,
       COALESCE(SUM(CASE WHEN status = 'overdue' THEN amount ELSE 0 END), 0) AS overdue
     FROM payments
     WHERE org_id = ? AND status != 'written_off'
       AND COALESCE(due_date, created_at) BETWEEN ? AND ?`,
    orgId, from, to,
  );
  const placements = db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM placements
      WHERE org_id = ? AND status != 'fallen_through' AND start_date BETWEEN ? AND ?`,
    orgId, from, to,
  );
  return {
    expected: money?.expected ?? 0,
    received: money?.received ?? 0,
    pending: money?.pending ?? 0,
    overdue: money?.overdue ?? 0,
    placements: placements?.n ?? 0,
  };
}

export function revenueThisMonth(orgId: string): RevenueSummary {
  refreshOverdue(orgId);
  return revenueForPeriod(orgId, dateOnly(startOfMonth()), dateOnly(endOfMonth()));
}
