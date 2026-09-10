import { Agent } from './framework.js';
import {
  factCheckAgentOutputSchema,
  researchAgentInputSchema,
  researchAgentOutputSchema,
  type FactCheckAgentOutput,
  type ResearchAgentInput,
  type ResearchAgentOutput,
} from '../shared/schemas.js';
import { z } from 'zod';
import { factConfidence } from '../shared/scoring.js';
import type { AgentName, Decision } from '../shared/types.js';

/** Gathers sourced findings for a topic (spec §12). */
export class ResearchAgent extends Agent<ResearchAgentInput, ResearchAgentOutput> {
  readonly name: AgentName = 'RESEARCH_AGENT';
  readonly promptName = 'RESEARCH_AGENT';
  readonly inputSchema = researchAgentInputSchema;
  readonly outputSchema = researchAgentOutputSchema;
  readonly outputName = 'research_findings';
  protected override readonly temperature = 0.35;
  protected override readonly maxTokens = 12_000;

  protected variables(input: ResearchAgentInput) {
    return {
      topic: input.topic,
      angle: input.angle,
      language: input.language,
      depth: input.depth,
      targetDurationMin: input.targetDurationMin,
      knownSources: input.knownSources.map((s) => `- ${s}`).join('\n') || 'none supplied',
    };
  }

  /**
   * A finding that names no source cannot be SUPPORTED, whatever the model claimed. This is
   * enforced in code rather than trusted to the prompt (spec §54).
   */
  protected override refine(output: ResearchAgentOutput): ResearchAgentOutput {
    return {
      ...output,
      findings: output.findings.map((finding) => {
        const hasSource = Boolean(finding.sourceUrl?.trim()) || finding.source.trim().length > 3;
        if (!hasSource && finding.verdict === 'SUPPORTED') {
          return { ...finding, verdict: 'UNVERIFIED' as const, confidence: Math.min(finding.confidence, 0.35) };
        }
        return finding;
      }),
    };
  }

  protected override explain(output: ResearchAgentOutput, input: ResearchAgentInput): Decision {
    const confidence = factConfidence(output.findings);
    const supported = output.findings.filter((f) => f.verdict === 'SUPPORTED').length;
    return {
      subject: 'Research',
      decision: `Collected ${output.findings.length} findings on "${input.topic}"`,
      reason: `${supported} of ${output.findings.length} findings are source-supported; aggregate fact confidence ${(
        confidence * 100
      ).toFixed(0)}%.`,
      score: Math.round(confidence * 100),
      dataUsed: { depth: input.depth, openQuestions: output.openQuestions.length },
    };
  }
}

export const factCheckInputSchema = z.object({
  script: z.string().min(20),
  findings: z.array(
    z.object({
      claim: z.string(),
      source: z.string(),
      sourceUrl: z.string().optional(),
      confidence: z.number(),
    }),
  ),
});
export type FactCheckAgentInput = z.infer<typeof factCheckInputSchema>;

/** Judges every checkable claim in a script against the research (spec §54). */
export class FactCheckAgent extends Agent<FactCheckAgentInput, FactCheckAgentOutput> {
  readonly name: AgentName = 'FACT_CHECK_AGENT';
  readonly promptName = 'FACT_CHECK_AGENT';
  readonly inputSchema = factCheckInputSchema;
  readonly outputSchema = factCheckAgentOutputSchema;
  readonly outputName = 'fact_check_report';
  protected override readonly temperature = 0.2;
  protected override readonly maxTokens = 10_000;

  protected variables(input: FactCheckAgentInput) {
    return {
      script: input.script,
      findings:
        input.findings
          .map((f) => `- ${f.claim} [${f.source}${f.sourceUrl ? ` — ${f.sourceUrl}` : ''}] (confidence ${f.confidence})`)
          .join('\n') || 'no research was supplied',
    };
  }

  /** Recompute the aggregate from the per-claim verdicts so it cannot be overstated. */
  protected override refine(output: FactCheckAgentOutput): FactCheckAgentOutput {
    return { ...output, overallConfidence: factConfidence(output.claims) };
  }

  protected override explain(output: FactCheckAgentOutput): Decision {
    const contradicted = output.claims.filter((c) => c.verdict === 'CONTRADICTED').length;
    const unverified = output.claims.filter((c) => c.verdict === 'UNVERIFIED').length;
    return {
      subject: 'Fact check',
      decision: contradicted > 0 ? 'Contradicted claims found' : unverified > 0 ? 'Unverified claims found' : 'Claims verified',
      reason: `${output.claims.length} claims checked: ${
        output.claims.length - unverified - contradicted
      } supported, ${unverified} unverified, ${contradicted} contradicted. ${output.removals.length} sentences flagged for removal.`,
      score: Math.round(output.overallConfidence * 100),
      dataUsed: { removals: output.removals.slice(0, 10) },
    };
  }
}
