import type { ChannelSettingsRepository, UsageRepository } from '../db/ports.js';
import type { Clock } from '../shared/clock.js';
import { BudgetExceededError } from '../shared/errors.js';
import type { Money } from '../shared/types.js';

export type BudgetLevel = 'ok' | 'warning' | 'critical' | 'exceeded';

export interface BudgetStatus {
  channelId: string;
  monthKey: string;
  budgetUsd: number;
  spentUsd: number;
  remainingUsd: number;
  utilisation: number;
  level: BudgetLevel;
  /** Optional (non-essential) generation is blocked at this point. */
  blocked: boolean;
  /** Expensive operations should pick their cheap tier. */
  degrade: boolean;
  projectedMonthEndUsd: number;
}

export interface BudgetDecision {
  allowed: boolean;
  status: BudgetStatus;
  reason: string;
}

/**
 * Budget protection (spec §42). Thresholds:
 *   ≥ 80 %  warn
 *   ≥ 90 %  warn again and degrade optional work to its cheap tier
 *   ≥ 100 % block every non-essential operation
 *
 * "Essential" covers the operations that finish work already paid for — QC, upload,
 * analytics. Stopping those would waste the spend that already happened.
 */
export class BudgetGuard {
  constructor(
    private readonly usage: UsageRepository,
    private readonly settings: ChannelSettingsRepository,
    private readonly clock: Clock,
    private readonly defaultBudgetUsd: number,
  ) {}

  async status(channelId: string): Promise<BudgetStatus> {
    const settings = await this.settings.findByChannel(channelId);
    const budgetUsd = settings?.monthlyBudgetUsd ?? this.defaultBudgetUsd;
    const now = this.clock.now();
    const { start, end } = monthWindow(now);
    const spentUsd = await this.usage.sumForChannel(channelId, start, end);

    const utilisation = budgetUsd <= 0 ? 0 : spentUsd / budgetUsd;
    const elapsedDays = Math.max(1, (now.getTime() - start.getTime()) / 86_400_000);
    const totalDays = (end.getTime() - start.getTime()) / 86_400_000;
    const projectedMonthEndUsd = round(spentUsd * (totalDays / elapsedDays), 4);

    const level: BudgetLevel =
      utilisation >= 1 ? 'exceeded' : utilisation >= 0.9 ? 'critical' : utilisation >= 0.8 ? 'warning' : 'ok';

    return {
      channelId,
      monthKey: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`,
      budgetUsd: round(budgetUsd),
      // Sub-cent precision: rounding a $0.019 spend up to $0.02 misreports what was used,
      // and these numbers drive the budget gate, not just the display.
      spentUsd: round(spentUsd, 4),
      remainingUsd: round(Math.max(0, budgetUsd - spentUsd), 4),
      utilisation: round(utilisation, 4),
      level,
      blocked: level === 'exceeded',
      degrade: level === 'critical' || level === 'exceeded',
      projectedMonthEndUsd,
    };
  }

  /** Checks a prospective spend. Never throws — the caller decides what to do. */
  async check(channelId: string, cost: Money, essential = false): Promise<BudgetDecision> {
    const status = await this.status(channelId);

    if (essential) {
      return {
        allowed: true,
        status,
        reason: 'Essential operation — allowed regardless of budget so already-paid work is not wasted.',
      };
    }
    if (status.blocked) {
      return {
        allowed: false,
        status,
        reason: `Monthly budget of $${status.budgetUsd.toFixed(2)} is exhausted ($${status.spentUsd.toFixed(
          2,
        )} spent). Non-essential generation is paused until the budget is raised or the month rolls over.`,
      };
    }
    if (status.remainingUsd < cost.usd) {
      return {
        allowed: false,
        status,
        reason: `This operation costs $${cost.usd.toFixed(4)} but only $${status.remainingUsd.toFixed(
          2,
        )} of the monthly budget remains.`,
      };
    }
    return {
      allowed: true,
      status,
      reason:
        status.level === 'ok'
          ? 'Within budget.'
          : `Allowed at ${(status.utilisation * 100).toFixed(0)}% of budget — expensive operations will use their cheaper tier.`,
    };
  }

  /** Throwing variant for call sites where continuing would overspend. */
  async require(channelId: string, cost: Money, essential = false): Promise<BudgetStatus> {
    const decision = await this.check(channelId, cost, essential);
    if (!decision.allowed) throw new BudgetExceededError(decision.reason, decision.status);
    return decision.status;
  }

  /** Per-video ceiling from channel settings (spec §57). */
  async videoBudget(channelId: string): Promise<number> {
    const settings = await this.settings.findByChannel(channelId);
    return settings?.maxCostPerVideoUsd ?? 15;
  }
}

export function monthWindow(now: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
