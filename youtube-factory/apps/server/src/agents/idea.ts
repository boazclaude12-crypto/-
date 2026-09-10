import { z } from 'zod';
import { Agent, type AgentContext } from './framework.js';
import {
  competitorAgentInputSchema,
  competitorAgentOutputSchema,
  ideaAgentInputSchema,
  ideaAgentOutputSchema,
  type CompetitorAgentInput,
  type CompetitorAgentOutput,
  type IdeaAgentInput,
  type IdeaAgentOutput,
} from '../shared/schemas.js';
import { DEFAULT_IDEA_WEIGHTS, scoreIdea, type IdeaWeights } from '../shared/scoring.js';
import type { AgentName, Decision } from '../shared/types.js';

/** Generates and scores video ideas (spec §10). */
export class IdeaAgent extends Agent<IdeaAgentInput, IdeaAgentOutput> {
  readonly name: AgentName = 'IDEA_AGENT';
  readonly promptName = 'IDEA_AGENT';
  readonly inputSchema = ideaAgentInputSchema;
  readonly outputSchema = ideaAgentOutputSchema;
  readonly outputName = 'content_ideas';
  protected override readonly temperature = 0.85;

  private weights: IdeaWeights = DEFAULT_IDEA_WEIGHTS;

  withWeights(weights: Partial<IdeaWeights>): this {
    this.weights = { ...DEFAULT_IDEA_WEIGHTS, ...weights };
    return this;
  }

  protected variables(input: IdeaAgentInput) {
    return {
      niche: input.niche,
      language: input.language,
      targetAudience: input.targetAudience,
      contentStyle: input.contentStyle,
      count: input.count,
      trends: input.trends.map((t) => `- ${t.topic} (${t.kind}, score ${t.score})`).join('\n') || 'none observed',
      competitorTopics: input.competitorTopics.map((t) => `- ${t}`).join('\n') || 'none available',
      recentTitles: input.recentTitles.map((t) => `- ${t}`).join('\n') || 'none yet',
      learnings: input.learnings.map((l) => `- ${l}`).join('\n') || 'no history yet',
      avoidTopics: input.avoidTopics.map((t) => `- ${t}`).join('\n') || 'none',
    };
  }

  /** The overall score is computed here, not by the model — the formula must be auditable. */
  protected override refine(output: IdeaAgentOutput): IdeaAgentOutput {
    return output;
  }

  scoreOf(idea: IdeaAgentOutput['ideas'][number]) {
    return scoreIdea(idea, this.weights);
  }

  protected override explain(output: IdeaAgentOutput, input: IdeaAgentInput): Decision {
    const best = [...output.ideas]
      .map((idea) => ({ idea, score: scoreIdea(idea, this.weights) }))
      .sort((a, b) => b.score.overall - a.score.overall)[0];
    return {
      subject: 'Idea generation',
      decision: `Generated ${output.ideas.length} ideas for ${input.niche}`,
      reason: best
        ? `Top idea "${best.idea.title}" scored ${best.score.overall} (demand ${best.idea.estimatedDemand}, trend ${best.idea.trendScore}, competition ${best.idea.competition}, CTR ${best.idea.estimatedCtr}).`
        : 'No ideas returned.',
      score: best?.score.overall,
      dataUsed: {
        trendSignals: input.trends.length,
        competitorTopics: input.competitorTopics.length,
        learnings: input.learnings.length,
        weights: this.weights,
      },
    };
  }
}

/** Learns what works in a niche from competitor channels — never what to copy (spec §9). */
export class CompetitorAgent extends Agent<CompetitorAgentInput, CompetitorAgentOutput> {
  readonly name: AgentName = 'COMPETITOR_AGENT';
  readonly promptName = 'COMPETITOR_AGENT';
  readonly inputSchema = competitorAgentInputSchema;
  readonly outputSchema = competitorAgentOutputSchema;
  readonly outputName = 'competitor_analysis';

  protected variables(input: CompetitorAgentInput) {
    return {
      niche: input.niche,
      channels: input.channels
        .map(
          (c) =>
            `## ${c.name}${c.subscriberCount ? ` (${c.subscriberCount.toLocaleString()} subscribers)` : ''}\n` +
            c.recentVideos
              .map(
                (v) =>
                  `- "${v.title}"${v.views ? ` · ${v.views.toLocaleString()} views` : ''}` +
                  `${v.durationSec ? ` · ${Math.round(v.durationSec / 60)} min` : ''}` +
                  `${v.publishedAt ? ` · ${v.publishedAt.slice(0, 10)}` : ''}`,
              )
              .join('\n'),
        )
        .join('\n\n'),
    };
  }

  protected override explain(output: CompetitorAgentOutput, input: CompetitorAgentInput): Decision {
    return {
      subject: 'Competitor analysis',
      decision: `Identified ${output.workingTopics.length} working topic clusters and ${output.contentGaps.length} gaps`,
      reason: `Analysed ${input.channels.length} channels covering ${input.channels.reduce(
        (n, c) => n + c.recentVideos.length,
        0,
      )} recent uploads in ${input.niche}.`,
      dataUsed: { channels: input.channels.map((c) => c.name) },
    };
  }
}

export const ideaListSchema = z.object({ ideas: ideaAgentOutputSchema.shape.ideas });
