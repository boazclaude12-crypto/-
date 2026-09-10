import type { AutomationRuleRecord, ChannelSettingsRecord } from '../db/types.js';
import type { RuleRepository } from '../db/ports.js';

/**
 * Pipeline automation rules (spec §57). The user writes rules like
 *   "if ideaScore > 80 → produce automatically"
 *   "if qcScore < 75 → regenerate"
 *   "if costUsd > 10 → require approval"
 * and the pipeline consults them at each gate.
 *
 * Conditions are structured data, never expressions — nothing user-supplied is ever
 * evaluated as code.
 */
export type RuleMetric =
  | 'ideaScore'
  | 'qcScore'
  | 'costUsd'
  | 'factConfidence'
  | 'thumbnailScore'
  | 'retentionScore'
  | 'qualityScore';

export type RuleActionType = 'produce' | 'regenerate' | 'requireApproval' | 'approve' | 'reject' | 'pause';

export interface RuleAction {
  type: RuleActionType;
  [key: string]: unknown;
}

export interface RuleEvaluation {
  matched: AutomationRuleRecord[];
  action: RuleAction | null;
  reason: string;
}

const OPS: Record<AutomationRuleRecord['condition']['op'], (a: number, b: number) => boolean> = {
  gt: (a, b) => a > b,
  gte: (a, b) => a >= b,
  lt: (a, b) => a < b,
  lte: (a, b) => a <= b,
  eq: (a, b) => Math.abs(a - b) < 1e-9,
};

export class RulesEngine {
  constructor(private readonly repo: RuleRepository) {}

  async evaluate(channelId: string, metrics: Partial<Record<RuleMetric, number>>): Promise<RuleEvaluation> {
    const rules = (await this.repo.listByChannel(channelId)).filter((r) => r.enabled);
    const matched = rules
      .filter((rule) => {
        const value = metrics[rule.condition.metric as RuleMetric];
        if (value === undefined) return false;
        const op = OPS[rule.condition.op];
        return op ? op(value, rule.condition.value) : false;
      })
      .sort((a, b) => a.priority - b.priority);

    const winner = matched[0];
    if (!winner) return { matched: [], action: null, reason: 'No automation rule matched.' };

    const value = metrics[winner.condition.metric as RuleMetric];
    return {
      matched,
      action: winner.action as RuleAction,
      reason: `Rule "${winner.name}" matched: ${winner.condition.metric} = ${value} ${winner.condition.op} ${winner.condition.value}.`,
    };
  }

  /**
   * The default rule set every new channel gets, expressed from its settings so the numbers
   * on the Settings screen and the rules stay in agreement.
   */
  static defaultsFor(settings: ChannelSettingsRecord): Array<Omit<AutomationRuleRecord, 'id' | 'createdAt' | 'updatedAt'>> {
    return [
      {
        channelId: settings.channelId,
        name: 'Produce high-scoring ideas automatically',
        condition: { metric: 'ideaScore', op: 'gte', value: settings.minIdeaScore + 10 },
        action: { type: 'produce' },
        enabled: true,
        priority: 10,
      },
      {
        channelId: settings.channelId,
        name: 'Regenerate when QC is weak',
        condition: { metric: 'qcScore', op: 'lt', value: settings.minQcScore },
        action: { type: 'regenerate' },
        enabled: true,
        priority: 20,
      },
      {
        channelId: settings.channelId,
        name: 'Require approval when a video gets expensive',
        condition: { metric: 'costUsd', op: 'gt', value: settings.maxCostPerVideoUsd },
        action: { type: 'requireApproval' },
        enabled: true,
        priority: 30,
      },
      {
        channelId: settings.channelId,
        name: 'Require manual review when facts are shaky',
        condition: { metric: 'factConfidence', op: 'lt', value: settings.minFactConfidence },
        action: { type: 'requireApproval', note: 'Fact confidence below the channel threshold' },
        enabled: true,
        priority: 5,
      },
      {
        channelId: settings.channelId,
        name: 'Auto-approve strong thumbnails',
        condition: { metric: 'thumbnailScore', op: 'gte', value: 85 },
        action: { type: 'approve' },
        enabled: true,
        priority: 40,
      },
    ];
  }
}
