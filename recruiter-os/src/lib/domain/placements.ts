import { getDb } from '../db/index';
import { repos } from '../db/repos';
import { addDays, dateOnly, nowIso } from '../time';
import { emitEvent, EVENT_TYPES } from './events';
import { candidateName } from './candidates';
import { ApiError } from '../errors';
import type { PlacementInput } from '../schemas';
import type { PlacementRow } from '../types';

export interface PlacementListItem extends PlacementRow {
  candidate_name: string;
  job_title: string;
  client_name: string;
  paid_amount: number;
  pending_amount: number;
}

const LIST_SQL = `
  SELECT p.*, (c.first_name || ' ' || c.last_name) AS candidate_name,
         j.title AS job_title, cl.name AS client_name,
         COALESCE((SELECT SUM(pay.amount) FROM payments pay WHERE pay.placement_id = p.id AND pay.status = 'paid'), 0) AS paid_amount,
         COALESCE((SELECT SUM(pay.amount) FROM payments pay WHERE pay.placement_id = p.id AND pay.status IN ('expected','invoiced','overdue')), 0) AS pending_amount
    FROM placements p
    JOIN candidates c ON c.id = p.candidate_id
    JOIN jobs j ON j.id = p.job_id
    JOIN clients cl ON cl.id = p.client_id`;

/** Commission from the agreed salary — percent of annual-equivalent, or a flat fee. */
export function calculateFee(
  feeType: 'percent' | 'fixed',
  feeValue: number,
  salary: number | null | undefined,
  salaryPeriod: string = 'month',
): number {
  if (feeType === 'fixed') return Math.round(feeValue);
  if (!salary) return 0;
  const monthly = salaryPeriod === 'hour' ? salary * 182 : salaryPeriod === 'year' ? salary / 12 : salary;
  return Math.round((monthly * feeValue) / 100);
}

export function createPlacement(orgId: string, userId: string, input: PlacementInput): PlacementRow {
  const candidate = repos.candidates.find(orgId, input.candidate_id);
  const job = repos.jobs.find(orgId, input.job_id);
  if (!candidate) throw new ApiError(404, 'מועמד לא נמצא');
  if (!job) throw new ApiError(404, 'משרה לא נמצאה');
  if (!job.client_id) throw new ApiError(400, 'למשרה אין לקוח משויך — לא ניתן לרשום השמה');

  const client = repos.clients.find(orgId, job.client_id);
  const feeType = input.fee_type ?? job.fee_type ?? 'percent';
  const feeValue = input.fee_value ?? job.fee_value ?? client?.fee_value ?? 12;
  const salary = input.salary ?? job.salary_max ?? job.salary_min ?? null;
  const feeAmount = calculateFee(feeType, feeValue, salary, job.salary_period);
  const guaranteeDays = input.guarantee_days ?? 90;

  const db = getDb();
  const placement = db.transaction(() => {
    const created = repos.placements.create(orgId, {
      application_id: input.application_id ?? null,
      candidate_id: candidate.id,
      job_id: job.id,
      client_id: job.client_id!,
      start_date: input.start_date,
      salary,
      fee_type: feeType,
      fee_value: feeValue,
      fee_amount: feeAmount,
      currency: 'ILS',
      status: 'active',
      guarantee_days: guaranteeDays,
      guarantee_until: addDays(guaranteeDays, input.start_date),
      notes: input.notes ?? null,
    });

    if (input.application_id) {
      repos.applications.update(orgId, input.application_id, {
        stage_key: 'hired', status: 'placed', stage_changed_at: nowIso(),
      });
    }
    repos.candidates.update(orgId, candidate.id, { status_key: 'hired' });

    if (input.create_payment !== false && feeAmount > 0) {
      repos.payments.create(orgId, {
        placement_id: created.id,
        client_id: job.client_id!,
        amount: feeAmount,
        currency: 'ILS',
        status: 'expected',
        due_date: dateOnly(addDays(client?.payment_terms_days ?? 30, input.start_date)),
      });
    }

    // Close the job once every seat is filled.
    const filled = repos.placements.count(orgId, "job_id = ? AND status != 'fallen_through'", [job.id]);
    if (filled >= job.headcount) {
      repos.jobs.update(orgId, job.id, { status: 'closed', closed_at: nowIso() });
    }
    return created;
  });

  emitEvent(orgId, {
    type: EVENT_TYPES.placementCreated,
    candidateId: candidate.id,
    jobId: job.id,
    clientId: job.client_id,
    applicationId: input.application_id ?? null,
    placementId: placement.id,
    actorUserId: userId,
    summary: `השמה: ${candidateName(candidate)} → ${job.title} (₪${feeAmount.toLocaleString('he-IL')})`,
    meta: { fee_amount: feeAmount },
  });
  return placement;
}

/** Marks the candidate as actually on the job — the milestone the guarantee runs from. */
export function markStarted(orgId: string, userId: string, placementId: string): PlacementRow {
  const placement = repos.placements.find(orgId, placementId);
  if (!placement) throw new ApiError(404, 'השמה לא נמצאה');

  const updated = repos.placements.update(orgId, placementId, { status: 'guarantee' })!;
  if (placement.application_id) {
    repos.applications.update(orgId, placement.application_id, { stage_key: 'started', stage_changed_at: nowIso() });
  }
  repos.candidates.update(orgId, placement.candidate_id, { status_key: 'started' });

  const candidate = repos.candidates.find(orgId, placement.candidate_id);
  emitEvent(orgId, {
    type: EVENT_TYPES.candidateStartedWork,
    candidateId: placement.candidate_id,
    jobId: placement.job_id,
    clientId: placement.client_id,
    placementId,
    actorUserId: userId,
    summary: `${candidateName(candidate)} התחיל לעבוד`,
  });
  return updated;
}

export function updatePlacement(
  orgId: string,
  userId: string,
  placementId: string,
  input: { status?: string; start_date?: string | null; salary?: number | null; fee_value?: number | null; notes?: string | null },
): PlacementRow | undefined {
  const before = repos.placements.find(orgId, placementId);
  if (!before) return undefined;

  const values: Record<string, string | number | null> = { ...input };
  if (input.fee_value != null || input.salary != null) {
    const job = repos.jobs.find(orgId, before.job_id);
    values.fee_amount = calculateFee(
      before.fee_type,
      input.fee_value ?? before.fee_value,
      input.salary ?? before.salary,
      job?.salary_period ?? 'month',
    );
  }
  if (input.start_date) values.guarantee_until = addDays(before.guarantee_days, input.start_date);

  const placement = repos.placements.update(orgId, placementId, values)!;

  if (input.status === 'fallen_through' && before.status !== 'fallen_through') {
    getDb().run(
      `UPDATE payments SET status = 'written_off', updated_at = ?
        WHERE org_id = ? AND placement_id = ? AND status != 'paid'`,
      nowIso(), orgId, placementId,
    );
    emitEvent(orgId, {
      type: 'placement.fallen_through',
      candidateId: placement.candidate_id,
      jobId: placement.job_id,
      clientId: placement.client_id,
      placementId,
      actorUserId: userId,
      summary: 'ההשמה התבטלה — התשלומים הפתוחים נמחקו',
    });
  }
  return placement;
}

export function listPlacements(
  orgId: string,
  filters: { clientId?: string; status?: string; from?: string; to?: string; limit?: number } = {},
): PlacementListItem[] {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (filters.clientId) {
    clauses.push('p.client_id = ?');
    params.push(filters.clientId);
  }
  if (filters.status) {
    clauses.push('p.status = ?');
    params.push(filters.status);
  }
  if (filters.from) {
    clauses.push('p.start_date >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    clauses.push('p.start_date <= ?');
    params.push(filters.to);
  }
  return getDb().all<PlacementListItem>(
    `${LIST_SQL} WHERE p.org_id = ? ${clauses.length ? `AND ${clauses.join(' AND ')}` : ''}
      ORDER BY p.start_date DESC LIMIT ?`,
    orgId, ...params, filters.limit ?? 100,
  );
}

export function getPlacement(orgId: string, placementId: string): PlacementListItem | undefined {
  return getDb().get<PlacementListItem>(`${LIST_SQL} WHERE p.org_id = ? AND p.id = ?`, orgId, placementId);
}

export function deletePlacement(orgId: string, placementId: string): boolean {
  return repos.placements.remove(orgId, placementId);
}
