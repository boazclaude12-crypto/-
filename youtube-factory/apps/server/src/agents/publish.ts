import { z } from 'zod';
import { Agent } from './framework.js';
import {
  qcAgentOutputSchema,
  seoAgentOutputSchema,
  thumbnailAgentOutputSchema,
  type QcAgentOutput,
  type SeoAgentOutput,
  type ThumbnailAgentOutput,
} from '../shared/schemas.js';
import { formatChapter } from '../shared/time.js';
import type { AgentName, Decision } from '../shared/types.js';

export const thumbnailInputSchema = z.object({
  title: z.string(),
  topic: z.string(),
  hook: z.string(),
  audience: z.string(),
  thumbnailStyle: z.string(),
});
export type ThumbnailAgentInput = z.infer<typeof thumbnailInputSchema>;

/** Designs thumbnail concepts and rates their click potential (spec §27). */
export class ThumbnailAgent extends Agent<ThumbnailAgentInput, ThumbnailAgentOutput> {
  readonly name: AgentName = 'THUMBNAIL_AGENT';
  readonly promptName = 'THUMBNAIL_AGENT';
  readonly inputSchema = thumbnailInputSchema;
  readonly outputSchema = thumbnailAgentOutputSchema;
  readonly outputName = 'thumbnail_concepts';
  protected override readonly temperature = 0.9;
  protected override readonly maxTokens = 4_000;

  protected variables(input: ThumbnailAgentInput) {
    return input as unknown as Record<string, unknown>;
  }

  /** Normalise variant labels to A/B/C and cap overlay text at the three words that fit. */
  protected override refine(output: ThumbnailAgentOutput): ThumbnailAgentOutput {
    const labels = ['A', 'B', 'C', 'D'];
    return {
      concepts: output.concepts.slice(0, 4).map((concept, i) => ({
        ...concept,
        variant: labels[i] ?? String(i),
        overlayText: concept.overlayText.split(/\s+/).slice(0, 3).join(' ').toUpperCase(),
      })),
    };
  }

  protected override explain(output: ThumbnailAgentOutput): Decision {
    const best = [...output.concepts].sort((a, b) => b.ctrPotential - a.ctrPotential)[0];
    return {
      subject: 'Thumbnail concepts',
      decision: best ? `Variant ${best.variant} leads with a predicted CTR score of ${best.ctrPotential}` : 'No concepts',
      reason: best?.reason ?? 'No concepts returned.',
      score: best?.ctrPotential,
      dataUsed: {
        variants: output.concepts.map((c) => ({ variant: c.variant, score: c.ctrPotential })),
      },
    };
  }
}

export const seoInputSchema = z.object({
  title: z.string(),
  topic: z.string(),
  script: z.string(),
  language: z.string().default('en'),
  research: z.array(z.object({ claim: z.string(), source: z.string(), sourceUrl: z.string().optional() })).default([]),
  chapters: z.array(z.object({ startSec: z.number(), title: z.string() })).default([]),
});
export type SeoAgentInput = z.infer<typeof seoInputSchema>;

/** Produces title candidates, description, tags and hashtags (spec §28, §29). */
export class SeoAgent extends Agent<SeoAgentInput, SeoAgentOutput> {
  readonly name: AgentName = 'SEO_AGENT';
  readonly promptName = 'SEO_AGENT';
  readonly inputSchema = seoInputSchema;
  readonly outputSchema = seoAgentOutputSchema;
  readonly outputName = 'seo_metadata';
  protected override readonly temperature = 0.75;
  protected override readonly maxTokens = 8_000;

  protected variables(input: SeoAgentInput) {
    return {
      title: input.title,
      topic: input.topic,
      language: input.language,
      script: input.script,
      chapters: input.chapters.map((c) => `${formatChapter(c.startSec)} ${c.title}`).join('\n') || 'none',
      research:
        input.research
          .map((r) => `- ${r.claim} — ${r.source}${r.sourceUrl ? ` (${r.sourceUrl})` : ''}`)
          .join('\n') || 'none',
    };
  }

  /**
   * Enforces the platform's own limits and the anti-stuffing rule (spec §29): duplicate
   * tags are dropped, the tag block is capped at YouTube's 500-character budget, and the
   * chapter list is appended verbatim from the computed timings rather than from the model.
   */
  protected override refine(output: SeoAgentOutput, input: SeoAgentInput): SeoAgentOutput {
    const seen = new Set<string>();
    const tags: string[] = [];
    let budget = 500;
    for (const tag of output.tags.map((t) => t.trim()).filter(Boolean)) {
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      if (tag.length + 1 > budget) break;
      seen.add(key);
      tags.push(tag);
      budget -= tag.length + 1;
    }

    let description = output.description.trim();
    if (input.chapters.length > 0 && !description.includes('00:00')) {
      const chapters = input.chapters.map((c) => `${formatChapter(c.startSec)} ${c.title}`).join('\n');
      description = `${description}\n\nChapters:\n${chapters}`;
    }

    return {
      ...output,
      tags,
      description: description.slice(0, 4800),
      hashtags: output.hashtags.slice(0, 3).map((h) => (h.startsWith('#') ? h : `#${h}`)),
      titles: [...output.titles].sort((a, b) => b.score - a.score),
    };
  }

  protected override explain(output: SeoAgentOutput): Decision {
    const best = output.titles[0];
    return {
      subject: 'SEO metadata',
      decision: best ? `Recommended title: "${best.text}"` : 'No titles produced',
      reason: best
        ? `Scored ${best.score}/100 in the "${best.category}" category — ${best.reason} Chosen from ${output.titles.length} candidates.`
        : 'The SEO agent returned no title candidates.',
      score: best?.score,
      dataUsed: {
        candidates: output.titles.slice(0, 10).map((t) => ({ text: t.text, category: t.category, score: t.score })),
        tagCount: output.tags.length,
      },
    };
  }
}

export const qcInputSchema = z.object({
  probe: z.record(z.unknown()),
  technicalChecks: z.array(
    z.object({ name: z.string(), passed: z.boolean(), severity: z.enum(['info', 'warn', 'blocker']), detail: z.string() }),
  ),
  scores: z.record(z.number()),
  thresholds: z.record(z.number()),
});
export type QcAgentInput = z.infer<typeof qcInputSchema>;

/** Final publish gate (spec §26, §32). */
export class QcAgent extends Agent<QcAgentInput, QcAgentOutput> {
  readonly name: AgentName = 'QC_AGENT';
  readonly promptName = 'QC_AGENT';
  readonly inputSchema = qcInputSchema;
  readonly outputSchema = qcAgentOutputSchema;
  readonly outputName = 'qc_verdict';
  protected override readonly temperature = 0.1;
  protected override readonly maxTokens = 4_000;

  protected variables(input: QcAgentInput) {
    return {
      probe: JSON.stringify(input.probe, null, 2),
      technicalChecks: input.technicalChecks
        .map((c) => `- [${c.passed ? 'PASS' : 'FAIL'}] (${c.severity}) ${c.name}: ${c.detail}`)
        .join('\n'),
      scores: Object.entries(input.scores)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join('\n'),
      thresholds: Object.entries(input.thresholds)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join('\n'),
    };
  }

  /**
   * The verdict is not the model's to soften. A failed blocker check means `passed: false`,
   * full stop — this is the rule that stops a broken render reaching a channel (spec §32).
   */
  protected override refine(output: QcAgentOutput, input: QcAgentInput): QcAgentOutput {
    const blockers = input.technicalChecks.filter((c) => !c.passed && c.severity === 'blocker');
    const merged = [...input.technicalChecks, ...output.checks.filter((c) => !input.technicalChecks.some((t) => t.name === c.name))];
    if (blockers.length === 0) return { ...output, checks: merged };
    return {
      ...output,
      checks: merged,
      passed: false,
      repairs: output.repairs.length
        ? output.repairs
        : blockers.map((b) => `Blocker "${b.name}" must be fixed: ${b.detail}`),
    };
  }

  protected override explain(output: QcAgentOutput): Decision {
    const failures = output.checks.filter((c) => !c.passed);
    return {
      subject: 'Quality control',
      decision: output.passed ? 'Approved for publishing' : 'Rejected',
      reason: output.passed
        ? `All blocker checks passed with an overall QC score of ${output.score}/100.`
        : `${failures.length} checks failed: ${failures.map((f) => f.name).join(', ')}.`,
      score: output.score,
      dataUsed: { failures: failures.map((f) => f.name), repairs: output.repairs },
    };
  }
}
