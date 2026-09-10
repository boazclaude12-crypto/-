import { z } from 'zod';
import { Agent } from './framework.js';
import {
  retentionAgentOutputSchema,
  scriptAgentInputSchema,
  scriptSchema,
  type RetentionAgentOutput,
  type ScriptAgentInput,
  type ScriptDraft,
} from '../shared/schemas.js';
import { countWords, estimateDurationSec, wordBudget } from '../shared/text.js';
import type { AgentName, Decision } from '../shared/types.js';

/** Writes the narration (spec §13, §15). */
export class ScriptAgent extends Agent<ScriptAgentInput, ScriptDraft> {
  readonly name: AgentName = 'SCRIPT_AGENT';
  readonly promptName = 'SCRIPT_AGENT';
  readonly inputSchema = scriptAgentInputSchema;
  readonly outputSchema = scriptSchema;
  readonly outputName = 'video_script';
  protected override readonly temperature = 0.8;
  protected override readonly maxTokens = 16_000;

  protected variables(input: ScriptAgentInput) {
    const budget = wordBudget(input.targetDurationSec, input.language);
    return {
      topic: input.topic,
      angle: input.angle,
      hook: input.hook,
      audience: input.audience,
      style: input.style,
      language: input.language,
      targetDurationSec: input.targetDurationSec,
      wordBudget: `${budget.min}-${budget.max} spoken words (target ${budget.target}, at ${input.wordsPerMinute} words per minute)`,
      // Roughly 90 seconds per section is the pacing that keeps pattern interrupts regular.
      sectionCount: Math.max(3, Math.round(input.targetDurationSec / 90)),
      structureHint: input.structureHint ?? '',
      research:
        input.research
          .map(
            (f) =>
              `- [${f.verdict}] ${f.claim} — ${f.source}${f.sourceUrl ? ` (${f.sourceUrl})` : ''} · confidence ${f.confidence}`,
          )
          .join('\n') || 'no research supplied',
      unverifiedClaims: input.unverifiedClaims.map((c) => `- ${c}`).join('\n') || 'none',
      rewriteInstructions: input.rewriteInstructions.map((r) => `- ${r}`).join('\n') || 'none — this is the first pass',
      previousScript: input.previousScript ? JSON.stringify(input.previousScript, null, 2) : '',
    };
  }

  /**
   * The model's own duration estimate is advisory. The stored figure is computed from the
   * actual word count at the language's speaking rate, so the scene planner and the
   * scheduler work from a number that reflects the text rather than the model's guess.
   */
  protected override refine(output: ScriptDraft, input: ScriptAgentInput): ScriptDraft {
    const narration = fullNarration(output);
    return { ...output, estimatedDurationSec: Math.round(estimateDurationSec(narration, input.language)) };
  }

  protected override explain(output: ScriptDraft, input: ScriptAgentInput): Decision {
    const words = countWords(fullNarration(output), input.language);
    const budget = wordBudget(input.targetDurationSec, input.language);
    const withinBudget = words >= budget.min && words <= budget.max;
    return {
      subject: 'Script',
      decision: `Wrote a ${output.sections.length}-section script using the "${output.structure}" structure`,
      reason: `${words} spoken words ≈ ${Math.round(output.estimatedDurationSec / 60)} min against a ${Math.round(
        input.targetDurationSec / 60,
      )} min target (${withinBudget ? 'within' : 'outside'} the ${budget.min}-${budget.max} word budget).`,
      dataUsed: {
        structure: output.structure,
        words,
        targetWords: budget.target,
        researchFindings: input.research.length,
        rewritePasses: input.rewriteInstructions.length,
      },
    };
  }
}

export const retentionInputSchema = z.object({
  script: scriptSchema,
  targetDurationSec: z.number().min(30),
});
export type RetentionAgentInput = z.infer<typeof retentionInputSchema>;

/** Predicts retention and produces concrete rewrite instructions (spec §14). */
export class RetentionAgent extends Agent<RetentionAgentInput, RetentionAgentOutput> {
  readonly name: AgentName = 'RETENTION_AGENT';
  readonly promptName = 'RETENTION_AGENT';
  readonly inputSchema = retentionInputSchema;
  readonly outputSchema = retentionAgentOutputSchema;
  readonly outputName = 'retention_assessment';
  protected override readonly temperature = 0.3;

  protected variables(input: RetentionAgentInput) {
    return {
      targetDurationSec: input.targetDurationSec,
      script: renderScript(input.script),
    };
  }

  /** A failed check with no instruction attached is useless to the rewrite loop. */
  protected override refine(output: RetentionAgentOutput): RetentionAgentOutput {
    const failed = output.checks.filter((c) => !c.passed);
    if (failed.length > 0 && output.rewriteInstructions.length === 0) {
      return {
        ...output,
        rewriteInstructions: failed.map((c) => `Fix "${c.name}": ${c.detail}`),
      };
    }
    return output;
  }

  protected override explain(output: RetentionAgentOutput): Decision {
    const failed = output.checks.filter((c) => !c.passed).map((c) => c.name);
    return {
      subject: 'Retention review',
      decision: `Retention score ${output.retentionScore}/100`,
      reason:
        failed.length === 0
          ? `All ${output.checks.length} retention checks passed; hook strength ${output.hookStrength}/100.`
          : `Failed checks: ${failed.join(', ')}. ${output.rewriteInstructions.length} rewrite instructions issued.`,
      score: output.retentionScore,
      dataUsed: { hookStrength: output.hookStrength, failedChecks: failed },
    };
  }
}

/** All spoken words of a script, in order. */
export function fullNarration(script: ScriptDraft): string {
  return [script.hook, script.intro, ...script.sections.map((s) => s.narration), script.cta]
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n\n');
}

/** Human-readable rendering handed to reviewing agents. */
export function renderScript(script: ScriptDraft): string {
  const lines = [
    `TITLE: ${script.title}`,
    `STRUCTURE: ${script.structure}`,
    '',
    `[HOOK]\n${script.hook}`,
    `[INTRO]\n${script.intro}`,
  ];
  for (const [i, section] of script.sections.entries()) {
    lines.push(
      `[SECTION ${i + 1}: ${section.heading} — target ${section.targetSeconds}s]\n${section.narration}` +
        (section.patternInterrupt ? `\n(pattern interrupt: ${section.patternInterrupt})` : ''),
    );
  }
  lines.push(`[CTA]\n${script.cta}`);
  return lines.join('\n\n');
}
