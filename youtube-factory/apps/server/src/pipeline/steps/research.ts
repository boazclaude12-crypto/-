import type { PipelineStep, StepContext, StepResult } from '../context.js';
import { fullNarration } from '../../agents/script.js';
import { factConfidence } from '../../shared/scoring.js';
import { wordsPerMinute } from '../../shared/text.js';
import { PipelineError } from '../../shared/errors.js';

/** IDEA → RESEARCH_COMPLETE. Gathers sourced findings for the chosen idea (spec §12). */
export const researchStep: PipelineStep = {
  name: 'research',
  from: 'IDEA',
  running: 'RESEARCHING',

  async execute(ctx: StepContext): Promise<StepResult> {
    const idea = ctx.video.ideaId ? await ctx.repos.ideas.findById(ctx.video.ideaId) : null;
    const topic = idea?.topic ?? ctx.video.title;
    const angle = idea?.angle ?? `A clear, well-sourced explanation of ${topic}.`;

    await ctx.reportProgress(10);

    const depth = ctx.video.targetDurationSec >= 1800 ? 'deep' : ctx.video.targetDurationSec >= 600 ? 'standard' : 'light';
    const result = await ctx.agents.research.run(
      {
        topic,
        angle,
        language: ctx.settings.language,
        depth,
        targetDurationMin: Math.round(ctx.video.targetDurationSec / 60),
        knownSources: [],
      },
      { channelId: ctx.channel.id, videoId: ctx.video.id, jobId: ctx.jobId, signal: ctx.signal },
    );

    await ctx.reportProgress(70);

    const confidence = factConfidence(result.output.findings);
    await ctx.repos.research.upsert(
      ctx.video.id,
      { topic, summary: result.output.summary, depth, confidence, openQuestions: result.output.openQuestions },
      result.output.findings.map((f) => ({
        claim: f.claim,
        source: f.source,
        sourceUrl: f.sourceUrl ?? null,
        sourceType: f.sourceType,
        publishedAt: f.date ? safeDate(f.date) : null,
        confidence: f.confidence,
        verdict: f.verdict,
        notes: null,
      })),
    );

    await ctx.reportProgress(100);

    return {
      status: 'RESEARCH_COMPLETE',
      patch: { factConfidence: confidence },
      note: `${result.output.findings.length} findings, aggregate confidence ${(confidence * 100).toFixed(0)}%`,
    };
  },
};

/** RESEARCH_COMPLETE → SCRIPT_READY. Writes and self-edits the script (spec §13, §14). */
export const scriptStep: PipelineStep = {
  name: 'script',
  from: 'RESEARCH_COMPLETE',
  running: 'SCRIPTING',

  async execute(ctx: StepContext): Promise<StepResult> {
    const research = await ctx.repos.research.findByVideo(ctx.video.id);
    if (!research) throw new PipelineError('Cannot write a script before research has run');

    const idea = ctx.video.ideaId ? await ctx.repos.ideas.findById(ctx.video.ideaId) : null;
    const unverified = research.sources.filter((s) => s.verdict !== 'SUPPORTED').map((s) => s.claim);

    let draft = null as Awaited<ReturnType<typeof ctx.agents.script.run>>['output'] | null;
    let retention: Awaited<ReturnType<typeof ctx.agents.retention.run>>['output'] | null = null;

    // When fact-checking sent this script back, its removals are the instructions the
    // rewrite must satisfy — otherwise the same unsupported sentences come straight back.
    const previous = await ctx.repos.scripts.findByVideo(ctx.video.id);
    const report = previous?.factCheckReport as { removals?: string[] } | null | undefined;
    let instructions: string[] = (report?.removals ?? []).map(
      (sentence) => `Remove or explicitly soften this unsupported sentence: "${sentence}"`,
    );

    // Write, assess, rewrite. The loop is bounded — two rewrites is where returns stop.
    const maxPasses = 3;
    for (let pass = 1; pass <= maxPasses; pass += 1) {
      await ctx.reportProgress(Math.round((pass - 1) * (60 / maxPasses)) + 5);

      const scriptResult = await ctx.agents.script.run(
        {
          topic: research.topic,
          angle: idea?.angle ?? research.summary.slice(0, 300),
          hook: idea?.hook ?? '',
          audience: ctx.settings.targetAudience,
          style: ctx.settings.contentStyle,
          language: ctx.settings.language,
          targetDurationSec: ctx.video.targetDurationSec,
          wordsPerMinute: wordsPerMinute(ctx.settings.language),
          research: research.sources.map((s) => ({
            claim: s.claim,
            source: s.source,
            sourceUrl: s.sourceUrl ?? undefined,
            sourceType: s.sourceType as never,
            date: s.publishedAt?.toISOString().slice(0, 10),
            confidence: s.confidence,
            verdict: s.verdict,
          })),
          unverifiedClaims: unverified,
          rewriteInstructions: instructions,
          previousScript: draft ?? undefined,
        },
        { channelId: ctx.channel.id, videoId: ctx.video.id, jobId: ctx.jobId, signal: ctx.signal },
      );
      draft = scriptResult.output;

      const retentionResult = await ctx.agents.retention.run(
        { script: draft, targetDurationSec: ctx.video.targetDurationSec },
        { channelId: ctx.channel.id, videoId: ctx.video.id, jobId: ctx.jobId, signal: ctx.signal },
      );
      retention = retentionResult.output;

      if (retention.retentionScore >= ctx.settings.minRetentionScore || pass === maxPasses) break;

      instructions = retention.rewriteInstructions;
      ctx.logger.info('rewriting script for retention', {
        videoId: ctx.video.id,
        pass,
        score: retention.retentionScore,
        threshold: ctx.settings.minRetentionScore,
      });
    }

    if (!draft) throw new PipelineError('The script agent returned nothing');

    await ctx.reportProgress(85);

    const narration = fullNarration(draft);
    await ctx.repos.scripts.upsert(ctx.video.id, {
      structure: draft.structure,
      hook: draft.hook,
      intro: draft.intro,
      sections: draft.sections,
      cta: draft.cta,
      wordCount: narration.trim().split(/\s+/).length,
      estimatedDuration: draft.estimatedDurationSec,
      retentionScore: retention?.retentionScore ?? null,
      retentionNotes: retention?.checks ?? null,
      factCheckScore: null,
      factCheckReport: null,
      revision: 1,
    });

    await ctx.repos.videos.update(ctx.video.id, { title: draft.title });
    await ctx.reportProgress(100);

    return {
      status: 'SCRIPT_READY',
      patch: { retentionScore: retention?.retentionScore ?? null, title: draft.title },
      note: `${draft.sections.length} sections, retention ${retention?.retentionScore ?? '?'}/100`,
    };
  },
};

/** SCRIPT_READY → SCENE_PLANNING. The anti-hallucination gate (spec §54). */
export const factCheckStep: PipelineStep = {
  name: 'fact-check',
  from: 'SCRIPT_READY',
  running: 'FACT_CHECK',

  async execute(ctx: StepContext): Promise<StepResult> {
    const [script, research] = await Promise.all([
      ctx.repos.scripts.findByVideo(ctx.video.id),
      ctx.repos.research.findByVideo(ctx.video.id),
    ]);
    if (!script) throw new PipelineError('No script to fact-check');

    await ctx.reportProgress(20);

    const narration = [script.hook, script.intro, ...script.sections.map((s) => s.narration), script.cta].join('\n\n');
    const result = await ctx.agents.factCheck.run(
      {
        script: narration,
        findings: (research?.sources ?? []).map((s) => ({
          claim: s.claim,
          source: s.source,
          sourceUrl: s.sourceUrl ?? undefined,
          confidence: s.confidence,
        })),
      },
      { channelId: ctx.channel.id, videoId: ctx.video.id, jobId: ctx.jobId, signal: ctx.signal },
    );

    await ctx.reportProgress(70);

    const confidence = result.output.overallConfidence;
    await ctx.repos.scripts.update(ctx.video.id, {
      factCheckScore: confidence,
      factCheckReport: result.output,
    });
    if (research) {
      await ctx.repos.research.updateSourceVerdicts(
        research.id,
        result.output.claims.map((c) => ({ claim: c.claim, verdict: c.verdict, confidence: c.confidence })),
      );
    }

    const contradicted = result.output.claims.filter((c) => c.verdict === 'CONTRADICTED').length;
    const belowThreshold = confidence < ctx.settings.minFactConfidence;

    // A contradicted claim is a hard stop; the script goes back to be rewritten rather than
    // being published with something the research disagrees with.
    if (contradicted > 0 && script.revision < 3) {
      ctx.logger.warn('fact check sending script back for rewrite', {
        videoId: ctx.video.id,
        contradicted,
        confidence,
      });
      return {
        status: 'RESEARCH_COMPLETE',
        patch: { factConfidence: confidence },
        note: `${contradicted} contradicted claims — rewriting`,
      };
    }

    if (belowThreshold && ctx.settings.automationMode === 'FULL_AUTO') {
      // In full-auto there is nobody to ask, so weak facts stop the video rather than ship.
      await notifyOwner(ctx, 'QC_FAILED', 'Fact confidence below threshold', {
        confidence,
        threshold: ctx.settings.minFactConfidence,
      });
      return {
        status: 'SCENE_PLANNING',
        patch: { factConfidence: confidence },
        enqueueNext: false,
        waitingForApproval: true,
        note: `Fact confidence ${(confidence * 100).toFixed(0)}% is below the channel's ${(
          ctx.settings.minFactConfidence * 100
        ).toFixed(0)}% threshold — manual review required before production continues.`,
      };
    }

    await ctx.reportProgress(100);
    return {
      status: 'SCENE_PLANNING',
      patch: { factConfidence: confidence },
      note: `Fact confidence ${(confidence * 100).toFixed(0)}%, ${result.output.removals.length} sentences flagged`,
    };
  },
};

async function notifyOwner(
  ctx: StepContext,
  event: 'QC_FAILED' | 'PIPELINE_FAILED',
  title: string,
  meta: Record<string, unknown>,
): Promise<void> {
  const channel = await ctx.repos.channels.findById(ctx.channel.id);
  if (!channel) return;
  await ctx.notifier.notify(channel.userId, {
    event,
    title,
    body: `Video "${ctx.video.title}" needs a look.`,
    url: `${ctx.config.http.appUrl}/videos/${ctx.video.id}`,
    meta,
  });
}

function safeDate(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
