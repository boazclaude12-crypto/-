import { z } from 'zod';
import { Agent } from './framework.js';
import {
  analyticsAgentOutputSchema,
  decisionAgentOutputSchema,
  strategyAgentOutputSchema,
  type AnalyticsAgentOutput,
  type DecisionAgentOutput,
  type StrategyAgentOutput,
} from '../shared/schemas.js';
import type { AgentName, Decision } from '../shared/types.js';

export const analyticsInputSchema = z.object({
  video: z.object({
    title: z.string(),
    durationSec: z.number(),
    publishedAt: z.string().optional(),
    topic: z.string().optional(),
    structure: z.string().optional(),
    hook: z.string().optional(),
    thumbnailVariant: z.string().optional(),
  }),
  predicted: z.record(z.number()),
  actual: z.record(z.number()),
  channelBaseline: z.record(z.number()),
});
export type AnalyticsAgentInput = z.infer<typeof analyticsInputSchema>;

/** Turns predicted-vs-actual into reusable learnings (spec §35). */
export class AnalyticsAgent extends Agent<AnalyticsAgentInput, AnalyticsAgentOutput> {
  readonly name: AgentName = 'ANALYTICS_AGENT';
  readonly promptName = 'ANALYTICS_AGENT';
  readonly inputSchema = analyticsInputSchema;
  readonly outputSchema = analyticsAgentOutputSchema;
  readonly outputName = 'analytics_observations';
  protected override readonly temperature = 0.3;

  protected variables(input: AnalyticsAgentInput) {
    return {
      video: JSON.stringify(input.video, null, 2),
      predicted: format(input.predicted),
      actual: format(input.actual),
      channelBaseline: format(input.channelBaseline),
    };
  }

  protected override explain(output: AnalyticsAgentOutput, input: AnalyticsAgentInput): Decision {
    const ctrDelta = (input.actual.ctr ?? 0) - (input.predicted.ctr ?? 0);
    const retentionDelta = (input.actual.averageViewPercentage ?? 0) - (input.predicted.retention ?? 0);
    return {
      subject: 'Performance review',
      decision: `${output.observations.length} learnings recorded`,
      reason: `${output.summary} CTR came in ${ctrDelta >= 0 ? '+' : ''}${ctrDelta.toFixed(
        1,
      )} points against prediction, retention ${retentionDelta >= 0 ? '+' : ''}${retentionDelta.toFixed(1)}.`,
      dataUsed: { predicted: input.predicted, actual: input.actual },
    };
  }
}

export const strategyInputSchema = z.object({
  videosPerWeek: z.number().min(1).max(21),
  recentVideos: z.array(
    z.object({
      title: z.string(),
      publishedAt: z.string().optional(),
      views: z.number().optional(),
      ctr: z.number().optional(),
      averageViewPercentage: z.number().optional(),
      durationSec: z.number().optional(),
    }),
  ),
  analytics: z.record(z.number()).default({}),
  competitors: z.array(z.string()).default([]),
  trends: z.array(z.string()).default([]),
  learnings: z.array(z.string()).default([]),
});
export type StrategyAgentInput = z.infer<typeof strategyInputSchema>;

/** The weekly content strategist (spec §36). */
export class StrategyAgent extends Agent<StrategyAgentInput, StrategyAgentOutput> {
  readonly name: AgentName = 'STRATEGY_AGENT';
  readonly promptName = 'STRATEGY_AGENT';
  readonly inputSchema = strategyInputSchema;
  readonly outputSchema = strategyAgentOutputSchema;
  readonly outputName = 'weekly_strategy';
  protected override readonly temperature = 0.7;
  protected override readonly maxTokens = 8_000;

  protected variables(input: StrategyAgentInput) {
    return {
      videosPerWeek: input.videosPerWeek,
      recentVideos:
        input.recentVideos
          .map(
            (v) =>
              `- "${v.title}"${v.views !== undefined ? ` · ${v.views} views` : ''}` +
              `${v.ctr !== undefined ? ` · CTR ${v.ctr}%` : ''}` +
              `${v.averageViewPercentage !== undefined ? ` · AVP ${v.averageViewPercentage}%` : ''}` +
              `${v.durationSec ? ` · ${Math.round(v.durationSec / 60)} min` : ''}`,
          )
          .join('\n') || 'no videos published yet',
      analytics: format(input.analytics),
      competitors: input.competitors.map((c) => `- ${c}`).join('\n') || 'none tracked',
      trends: input.trends.map((t) => `- ${t}`).join('\n') || 'none observed',
      learnings: input.learnings.map((l) => `- ${l}`).join('\n') || 'none accumulated yet',
    };
  }

  /** The mix must add up to the channel's actual weekly output, not to a nice-looking plan. */
  protected override refine(output: StrategyAgentOutput, input: StrategyAgentInput): StrategyAgentOutput {
    const total = output.mix.evergreen + output.mix.trending + output.mix.experimental;
    if (total === input.videosPerWeek || total === 0) return output;
    const scale = input.videosPerWeek / total;
    const evergreen = Math.round(output.mix.evergreen * scale);
    const trending = Math.round(output.mix.trending * scale);
    return {
      ...output,
      mix: {
        evergreen,
        trending,
        experimental: Math.max(0, input.videosPerWeek - evergreen - trending),
      },
    };
  }

  protected override explain(output: StrategyAgentOutput): Decision {
    return {
      subject: 'Weekly strategy',
      decision: `${output.mix.evergreen} evergreen, ${output.mix.trending} trending, ${output.mix.experimental} experimental`,
      reason: output.summary,
      dataUsed: {
        recommendations: output.recommendations.map((r) => ({ topic: r.topic, type: r.type, priority: r.priority })),
      },
    };
  }
}

export const decisionInputSchema = z.object({
  subject: z.string(),
  options: z.array(z.object({ id: z.string(), label: z.string(), detail: z.string().optional() })).min(2),
  data: z.record(z.unknown()).default({}),
  constraints: z.array(z.string()).default([]),
});
export type DecisionAgentInput = z.infer<typeof decisionInputSchema>;

/**
 * Generic explainable chooser (spec §58, §79). Used wherever the pipeline faces a judgement
 * call that is not worth a dedicated agent — which model, which voice, when to publish.
 */
export class DecisionAgent extends Agent<DecisionAgentInput, DecisionAgentOutput> {
  readonly name: AgentName = 'DECISION_AGENT';
  readonly promptName = 'DECISION_AGENT';
  readonly inputSchema = decisionInputSchema;
  readonly outputSchema = decisionAgentOutputSchema;
  readonly outputName = 'decision';
  protected override readonly temperature = 0.2;
  protected override readonly maxTokens = 2_000;

  protected variables(input: DecisionAgentInput) {
    return {
      subject: input.subject,
      options: input.options.map((o) => `- ${o.id}: ${o.label}${o.detail ? ` — ${o.detail}` : ''}`).join('\n'),
      data: JSON.stringify(input.data, null, 2),
      constraints: input.constraints.map((c) => `- ${c}`).join('\n') || 'none',
    };
  }

  /** A choice that is not one of the offered ids is unusable to the caller; fall back. */
  protected override refine(output: DecisionAgentOutput, input: DecisionAgentInput): DecisionAgentOutput {
    const valid = input.options.some((o) => o.id === output.choice);
    if (valid) return output;
    const matched = input.options.find(
      (o) => output.choice.toLowerCase().includes(o.id.toLowerCase()) || o.label.toLowerCase() === output.choice.toLowerCase(),
    );
    return {
      ...output,
      choice: matched?.id ?? input.options[0]!.id,
      reason: matched
        ? output.reason
        : `${output.reason} (Model returned an unrecognised option "${output.choice}"; defaulted to the first option.)`,
    };
  }

  protected override explain(output: DecisionAgentOutput, input: DecisionAgentInput): Decision {
    return {
      subject: input.subject,
      decision: output.choice,
      reason: output.reason,
      score: output.score,
      dataUsed: { ...input.data, ...output.dataUsed },
    };
  }
}

function format(values: Record<string, number>): string {
  const entries = Object.entries(values);
  if (entries.length === 0) return 'no data';
  return entries.map(([k, v]) => `- ${k}: ${v}`).join('\n');
}
