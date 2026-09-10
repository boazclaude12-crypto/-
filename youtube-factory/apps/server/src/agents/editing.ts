import { z } from 'zod';
import { Agent } from './framework.js';
import type { AgentName, Decision } from '../shared/types.js';

export const editingAgentOutputSchema = z.object({
  transitions: z
    .array(
      z.object({
        afterSceneIndex: z.number().int().min(0),
        type: z.enum(['cut', 'fade', 'dissolve', 'slideleft', 'slideright']),
        durationSec: z.number().min(0).max(2).default(0.4),
      }),
    )
    .default([]),
  overlays: z
    .array(
      z.object({
        text: z.string().min(1).max(80),
        startSec: z.number().min(0),
        durationSec: z.number().min(0.5).max(15),
        position: z.enum(['top', 'center', 'bottom', 'lower-third']).default('lower-third'),
      }),
    )
    .default([]),
  sfx: z
    .array(
      z.object({
        atSec: z.number().min(0),
        kind: z.enum(['whoosh', 'impact', 'transition', 'ambient', 'riser']),
        gainDb: z.number().min(-40).max(0).default(-18),
        reason: z.string().max(200),
      }),
    )
    .default([]),
  music: z.object({
    mood: z.string(),
    gainDb: z.number().min(-40).max(0).default(-22),
    duckToDb: z.number().min(-60).max(-6).default(-30),
    fadeInSec: z.number().min(0).max(10).default(2),
    fadeOutSec: z.number().min(0).max(10).default(3),
  }),
  notes: z.string().max(1000).default(''),
});
export type EditingAgentOutput = z.infer<typeof editingAgentOutputSchema>;

export const editingInputSchema = z.object({
  style: z.string(),
  totalDurationSec: z.number().min(10),
  musicMood: z.string(),
  scenes: z.array(
    z.object({
      index: z.number(),
      startSec: z.number(),
      durationSec: z.number(),
      visualBrief: z.string(),
      textOverlay: z.string().optional(),
      sfx: z.string().optional(),
      importance: z.number(),
    }),
  ),
  voiceSegments: z.array(z.object({ index: z.number(), startSec: z.number(), durationSec: z.number(), text: z.string() })),
});
export type EditingAgentInput = z.infer<typeof editingInputSchema>;

/** Decides cuts, transitions, overlays, SFX and the music bed (spec §23, §24). */
export class EditingAgent extends Agent<EditingAgentInput, EditingAgentOutput> {
  readonly name: AgentName = 'EDITING_AGENT';
  readonly promptName = 'EDITING_AGENT';
  readonly inputSchema = editingInputSchema;
  readonly outputSchema = editingAgentOutputSchema;
  readonly outputName = 'edit_decisions';
  protected override readonly temperature = 0.5;
  protected override readonly maxTokens = 8_000;

  protected variables(input: EditingAgentInput) {
    return {
      style: input.style,
      totalDurationSec: Math.round(input.totalDurationSec),
      musicMood: input.musicMood,
      scenes: input.scenes
        .map(
          (s) =>
            `- #${s.index} @${s.startSec.toFixed(1)}s for ${s.durationSec.toFixed(1)}s (importance ${s.importance}): ${
              s.visualBrief
            }${s.textOverlay ? ` | overlay: "${s.textOverlay}"` : ''}${s.sfx ? ` | sfx hint: ${s.sfx}` : ''}`,
        )
        .join('\n'),
      voiceSegments: input.voiceSegments
        .map((v) => `- #${v.index} @${v.startSec.toFixed(1)}s for ${v.durationSec.toFixed(1)}s`)
        .join('\n'),
    };
  }

  /**
   * Two things are corrected here rather than trusted to the model:
   *  - anything scheduled past the end of the video is dropped, since ffmpeg would either
   *    fail or silently extend the render;
   *  - SFX are thinned to at most one every four seconds, which is the "do not overdo it"
   *    rule from spec §23 expressed as something enforceable.
   */
  protected override refine(output: EditingAgentOutput, input: EditingAgentInput): EditingAgentOutput {
    const end = input.totalDurationSec;
    const sfx = [...output.sfx]
      .filter((s) => s.atSec < end)
      .sort((a, b) => a.atSec - b.atSec)
      .reduce<EditingAgentOutput['sfx']>((kept, cue) => {
        const last = kept[kept.length - 1];
        if (!last || cue.atSec - last.atSec >= 4) kept.push(cue);
        return kept;
      }, []);

    const maxSceneIndex = Math.max(0, ...input.scenes.map((s) => s.index));
    return {
      ...output,
      sfx,
      transitions: output.transitions.filter((t) => t.afterSceneIndex < maxSceneIndex),
      overlays: output.overlays
        .filter((o) => o.startSec < end)
        .map((o) => ({ ...o, durationSec: Math.min(o.durationSec, end - o.startSec) }))
        .filter((o) => o.durationSec >= 0.5),
    };
  }

  protected override explain(output: EditingAgentOutput, input: EditingAgentInput): Decision {
    const nonCut = output.transitions.filter((t) => t.type !== 'cut').length;
    return {
      subject: 'Edit plan',
      decision: `${input.scenes.length} scenes, ${nonCut} non-cut transitions, ${output.sfx.length} sound effects`,
      reason:
        output.notes ||
        `Music bed "${output.music.mood}" at ${output.music.gainDb} dB, ducking to ${output.music.duckToDb} dB under narration.`,
      dataUsed: {
        transitions: output.transitions.length,
        overlays: output.overlays.length,
        sfx: output.sfx.length,
      },
    };
  }
}
