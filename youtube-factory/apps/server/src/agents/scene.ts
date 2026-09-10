import { z } from 'zod';
import { Agent } from './framework.js';
import {
  sceneAgentOutputSchema,
  scriptSchema,
  visualAgentOutputSchema,
  voiceAgentOutputSchema,
  type SceneAgentOutput,
  type VisualAgentOutput,
  type VoiceAgentOutput,
} from '../shared/schemas.js';
import { renderScript, fullNarration } from './script.js';
import { chunkText } from '../shared/text.js';
import type { AgentName, Decision } from '../shared/types.js';

export const sceneInputSchema = z.object({
  script: scriptSchema,
  visualStyle: z.string(),
  aspectRatio: z.string().default('16:9'),
  sceneDurationSec: z.number().min(2).max(30).default(7),
  language: z.string().default('en'),
  characters: z
    .array(
      z.object({
        name: z.string(),
        age: z.string().optional(),
        gender: z.string().optional(),
        clothing: z.string().optional(),
        hair: z.string().optional(),
        face: z.string().optional(),
        bodyType: z.string().optional(),
        style: z.string().optional(),
      }),
    )
    .default([]),
});
export type SceneAgentInput = z.infer<typeof sceneInputSchema>;

/** Turns the script into a shot list (spec §16, §17). */
export class SceneAgent extends Agent<SceneAgentInput, SceneAgentOutput> {
  readonly name: AgentName = 'SCENE_AGENT';
  readonly promptName = 'SCENE_AGENT';
  readonly inputSchema = sceneInputSchema;
  readonly outputSchema = sceneAgentOutputSchema;
  readonly outputName = 'scene_plan';
  protected override readonly temperature = 0.7;
  protected override readonly maxTokens = 16_000;

  protected variables(input: SceneAgentInput) {
    // Anchoring the count to runtime ÷ typical scene length keeps pacing honest: without it
    // models tend to emit a handful of very long scenes regardless of the script.
    const sceneCount = Math.max(
      3,
      Math.round(input.script.estimatedDurationSec / Math.max(2, input.sceneDurationSec)),
    );
    return {
      script: renderScript(input.script),
      visualStyle: input.visualStyle,
      aspectRatio: input.aspectRatio,
      sceneDurationSec: input.sceneDurationSec,
      sceneCount,
      language: input.language,
      characters:
        input.characters
          .map((c) => `- ${c.name}: ${[c.age, c.gender, c.hair, c.clothing, c.face, c.style].filter(Boolean).join(', ')}`)
          .join('\n') || 'none defined yet',
    };
  }

  /**
   * Re-indexes scenes and injects the character bible into every prompt that names a
   * character, which is what actually keeps a recurring person consistent between shots
   * (spec §17) — relying on the model to remember to do it is not good enough.
   */
  protected override refine(output: SceneAgentOutput, input: SceneAgentInput): SceneAgentOutput {
    const bible = new Map<string, string>();
    for (const c of [...input.characters, ...output.characterBible]) {
      const description = [c.age, c.gender, c.hair, c.clothing, c.face, c.bodyType, c.style]
        .filter(Boolean)
        .join(', ');
      if (description) bible.set(c.name.toLowerCase(), `${c.name}: ${description}`);
    }

    const scenes = output.scenes
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((scene, index) => {
        const descriptions = scene.characters
          .map((name) => bible.get(name.toLowerCase()))
          .filter((d): d is string => Boolean(d));
        const prompt = descriptions.length
          ? `${scene.prompt} Character continuity — ${descriptions.join('; ')}.`
          : scene.prompt;
        return {
          ...scene,
          index,
          prompt,
          aspectRatio: scene.aspectRatio || input.aspectRatio,
          style: scene.style ?? input.visualStyle,
        };
      });

    return { ...output, scenes };
  }

  protected override explain(output: SceneAgentOutput): Decision {
    const total = output.scenes.reduce((sum, s) => sum + s.durationSec, 0);
    const durations = output.scenes.map((s) => s.durationSec);
    return {
      subject: 'Scene planning',
      decision: `Planned ${output.scenes.length} scenes covering ${Math.round(total)}s`,
      reason: `Scene lengths range ${Math.min(...durations)}-${Math.max(...durations)}s (varied with pacing); ${
        output.characterBible.length
      } recurring characters locked for continuity.`,
      dataUsed: {
        sceneCount: output.scenes.length,
        totalSeconds: Math.round(total),
        highImportance: output.scenes.filter((s) => s.importance >= 0.7).length,
      },
    };
  }
}

export const visualInputSchema = z.object({
  scene: z.object({
    index: z.number(),
    durationSec: z.number(),
    visualBrief: z.string(),
    prompt: z.string(),
    negativePrompt: z.string().optional(),
    motion: z.string().optional(),
    importance: z.number(),
  }),
  visualStyle: z.string(),
  budgetRemainingUsd: z.number(),
  costs: z.record(z.number()),
});
export type VisualAgentInput = z.infer<typeof visualInputSchema>;

/** Chooses how a single scene's visual gets produced (spec §18, §19). */
export class VisualAgent extends Agent<VisualAgentInput, VisualAgentOutput> {
  readonly name: AgentName = 'VISUAL_AGENT';
  readonly promptName = 'VISUAL_AGENT';
  readonly inputSchema = visualInputSchema;
  readonly outputSchema = visualAgentOutputSchema;
  readonly outputName = 'visual_strategy';
  protected override readonly temperature = 0.3;
  protected override readonly maxTokens = 2_000;

  protected variables(input: VisualAgentInput) {
    return {
      scene: JSON.stringify(input.scene, null, 2),
      visualStyle: input.visualStyle,
      budgetRemainingUsd: input.budgetRemainingUsd.toFixed(2),
      costs: Object.entries(input.costs)
        .map(([strategy, cost]) => `- ${strategy}: $${cost.toFixed(4)}`)
        .join('\n'),
    };
  }

  protected override explain(output: VisualAgentOutput, input: VisualAgentInput): Decision {
    return {
      subject: `Scene ${input.scene.index} visual strategy`,
      decision: output.strategy,
      reason: output.reason,
      score: Math.round(input.scene.importance * 100),
      dataUsed: { costs: input.costs, budgetRemainingUsd: input.budgetRemainingUsd },
    };
  }
}

export const voiceInputSchema = z.object({
  script: scriptSchema,
  language: z.string().default('en'),
  voiceProfile: z.string().default('warm documentary narrator'),
  maxCharsPerSegment: z.number().min(200).max(5000).default(900),
});
export type VoiceAgentInput = z.infer<typeof voiceInputSchema>;

/** Prepares narration for TTS (spec §20). */
export class VoiceAgent extends Agent<VoiceAgentInput, VoiceAgentOutput> {
  readonly name: AgentName = 'VOICE_AGENT';
  readonly promptName = 'VOICE_AGENT';
  readonly inputSchema = voiceInputSchema;
  readonly outputSchema = voiceAgentOutputSchema;
  readonly outputName = 'voice_segments';
  protected override readonly temperature = 0.2;
  protected override readonly maxTokens = 16_000;

  protected variables(input: VoiceAgentInput) {
    return {
      script: fullNarration(input.script),
      language: input.language,
      voiceProfile: input.voiceProfile,
      maxCharsPerSegment: input.maxCharsPerSegment,
    };
  }

  /**
   * Guards the one thing that must never happen here: the model paraphrasing the script.
   * If the segments do not reconstruct the narration, they are discarded and the text is
   * split deterministically instead.
   */
  protected override refine(output: VoiceAgentOutput, input: VoiceAgentInput): VoiceAgentOutput {
    const source = fullNarration(input.script);
    const rebuilt = output.segments.map((s) => s.text).join(' ');
    if (similarity(normalise(source), normalise(rebuilt)) >= 0.9) {
      return {
        segments: output.segments
          .slice()
          .sort((a, b) => a.index - b.index)
          .map((s, index) => ({ ...s, index })),
      };
    }
    return { segments: splitDeterministically(source, input.maxCharsPerSegment) };
  }

  protected override explain(output: VoiceAgentOutput): Decision {
    const chars = output.segments.reduce((n, s) => n + s.text.length, 0);
    return {
      subject: 'Voice segmentation',
      decision: `Split narration into ${output.segments.length} segments`,
      reason: `${chars} characters across ${output.segments.length} segments, each ending on a sentence boundary.`,
      dataUsed: { characters: chars },
    };
  }
}

export function splitDeterministically(text: string, maxChars: number): VoiceAgentOutput['segments'] {
  return chunkText(text, maxChars).map((chunk, index) => ({
    index,
    text: chunk,
    emotion: 'neutral',
    pauseAfterMs: 350,
  }));
}

function normalise(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
}

/** Token-level Jaccard similarity — enough to catch a paraphrase without being brittle. */
function similarity(a: string, b: string): number {
  const left = new Set(a.split(' '));
  const right = new Set(b.split(' '));
  if (left.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.max(left.size, right.size);
}
