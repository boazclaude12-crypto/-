import { z } from 'zod';

/**
 * The timeline is the contract between "what the agents decided" and "what FFmpeg renders"
 * (spec §24). It is declarative and provider-agnostic: no ffmpeg syntax appears in it, and
 * it can be inspected, diffed and re-rendered without re-running any generation.
 *
 * Layout invariant: scenes are contiguous — `scene[i+1].startSec === scene[i].startSec +
 * scene[i].durationSec` — and `durationSec` equals the sum of the scene durations. The
 * renderer preserves this even when transitions overlap, so audio never drifts from video.
 */

export const timelineSourceSchema = z.object({
  kind: z.enum(['image', 'video', 'color']),
  /** Absolute path on the render machine. Absent for `color`. */
  path: z.string().optional(),
  color: z.string().optional(),
});

export const timelineSceneSchema = z.object({
  index: z.number().int().min(0),
  startSec: z.number().min(0),
  durationSec: z.number().min(0.2),
  source: timelineSourceSchema,
  /** Slow zoom/pan applied to stills so a static frame never sits on screen unmoving. */
  kenBurns: z
    .object({ enabled: z.boolean().default(true), zoomTo: z.number().min(1).max(1.5).default(1.12) })
    .optional(),
  /** Transition into the NEXT scene. */
  transition: z
    .object({
      type: z.enum(['cut', 'fade', 'dissolve', 'slideleft', 'slideright']).default('cut'),
      durationSec: z.number().min(0).max(2).default(0),
    })
    .default({ type: 'cut', durationSec: 0 }),
});
export type TimelineScene = z.infer<typeof timelineSceneSchema>;

export const audioClipSchema = z.object({
  path: z.string(),
  startSec: z.number().min(0),
  durationSec: z.number().min(0),
  gainDb: z.number().min(-60).max(12).default(0),
});
export type AudioClip = z.infer<typeof audioClipSchema>;

export const musicClipSchema = audioClipSchema.extend({
  fadeInSec: z.number().min(0).max(15).default(2),
  fadeOutSec: z.number().min(0).max(15).default(3),
  /** Level the bed drops to while narration is playing. */
  duckToDb: z.number().min(-60).max(-3).default(-30),
  license: z.string().default('owned'),
  attribution: z.string().optional(),
});
export type MusicClip = z.infer<typeof musicClipSchema>;

export const overlaySchema = z.object({
  text: z.string().min(1).max(120),
  startSec: z.number().min(0),
  durationSec: z.number().min(0.2),
  position: z.enum(['top', 'center', 'bottom', 'lower-third']).default('lower-third'),
  fontSize: z.number().min(12).max(160).optional(),
});
export type Overlay = z.infer<typeof overlaySchema>;

export const timelineSchema = z.object({
  version: z.literal(1).default(1),
  width: z.number().int().min(256),
  height: z.number().int().min(144),
  fps: z.number().int().min(12).max(60),
  durationSec: z.number().min(1),
  scenes: z.array(timelineSceneSchema).min(1),
  voiceover: z.array(audioClipSchema).default([]),
  music: z.array(musicClipSchema).default([]),
  sfx: z.array(audioClipSchema).default([]),
  overlays: z.array(overlaySchema).default([]),
  captions: z
    .object({ srtPath: z.string(), burnIn: z.boolean().default(false), fontSize: z.number().default(22) })
    .optional(),
  watermark: z
    .object({
      path: z.string(),
      position: z.enum(['tl', 'tr', 'bl', 'br']).default('br'),
      opacity: z.number().min(0).max(1).default(0.6),
      marginPx: z.number().min(0).default(36),
    })
    .optional(),
  intro: z.object({ path: z.string(), durationSec: z.number().min(0) }).optional(),
  outro: z.object({ path: z.string(), durationSec: z.number().min(0) }).optional(),
  audio: z
    .object({
      /** Integrated loudness target. −16 LUFS is the usual level for speech-led online video. */
      normalizeLufs: z.number().min(-30).max(-8).default(-16),
      truePeakDb: z.number().min(-6).max(0).default(-1.5),
      voiceGainDb: z.number().min(-20).max(12).default(0),
    })
    .default({ normalizeLufs: -16, truePeakDb: -1.5, voiceGainDb: 0 }),
});
export type Timeline = z.infer<typeof timelineSchema>;

export interface SceneInput {
  index: number;
  durationSec: number;
  /** Local path to the produced visual. */
  path: string;
  kind: 'image' | 'video';
  textOverlay?: string | null;
}

export interface VoiceInput {
  index: number;
  path: string;
  durationSec: number;
}

export interface BuildTimelineInput {
  width: number;
  height: number;
  fps: number;
  scenes: SceneInput[];
  voiceover: VoiceInput[];
  music?: { path: string; gainDb: number; duckToDb: number; fadeInSec: number; fadeOutSec: number; license: string; attribution?: string };
  sfx?: Array<{ path: string; atSec: number; durationSec: number; gainDb: number }>;
  transitions?: Array<{ afterSceneIndex: number; type: TimelineScene['transition']['type']; durationSec: number }>;
  overlays?: Overlay[];
  captions?: { srtPath: string; burnIn: boolean };
  watermark?: Timeline['watermark'];
}

/**
 * Assembles a timeline from produced assets and the editing agent's decisions.
 *
 * Video length is driven by the *scenes*, and the scene plan was itself derived from the
 * narration, so the two agree by construction. The last scene is stretched if the narration
 * still overruns — a video that ends mid-sentence is worse than one that holds a frame.
 */
export function buildTimeline(input: BuildTimelineInput): Timeline {
  const transitionByScene = new Map(input.transitions?.map((t) => [t.afterSceneIndex, t]) ?? []);

  const narrationTotal = input.voiceover.reduce((sum, v) => sum + v.durationSec, 0);
  const ordered = fitScenesToNarration([...input.scenes].sort((a, b) => a.index - b.index), narrationTotal);

  let cursor = 0;
  const scenes: TimelineScene[] = ordered.map((scene, i) => {
    const isLast = i === ordered.length - 1;
    const decided = transitionByScene.get(scene.index);
    const transition =
      isLast || !decided || decided.type === 'cut'
        ? { type: 'cut' as const, durationSec: 0 }
        : { type: decided.type, durationSec: Math.min(decided.durationSec, scene.durationSec / 2) };

    const entry: TimelineScene = {
      index: i,
      startSec: round(cursor),
      durationSec: round(scene.durationSec),
      source: { kind: scene.kind, path: scene.path },
      kenBurns: scene.kind === 'image' ? { enabled: true, zoomTo: 1.12 } : undefined,
      transition,
    };
    cursor += scene.durationSec;
    return entry;
  });

  // Lay the narration out end to end and stretch the final scene if it runs long.
  let audioCursor = 0;
  const voiceover: AudioClip[] = [...input.voiceover]
    .sort((a, b) => a.index - b.index)
    .map((clip) => {
      const entry: AudioClip = {
        path: clip.path,
        startSec: round(audioCursor),
        durationSec: round(clip.durationSec),
        gainDb: 0,
      };
      audioCursor += clip.durationSec;
      return entry;
    });

  const narrationEnd = audioCursor;
  const last = scenes[scenes.length - 1];
  if (last && narrationEnd > cursor + 0.05) {
    const extra = narrationEnd - cursor;
    last.durationSec = round(last.durationSec + extra);
    cursor = narrationEnd;
  }
  const durationSec = round(Math.max(cursor, 1));

  const overlays: Overlay[] = [
    ...(input.overlays ?? []),
    // Scene-level overlays come from the scene plan and are placed on their own scene.
    ...ordered.flatMap((scene, i) => {
      const text = scene.textOverlay?.trim();
      if (!text) return [];
      const placed = scenes[i];
      if (!placed) return [];
      return [
        {
          text: text.slice(0, 120),
          startSec: round(placed.startSec + 0.3),
          durationSec: round(Math.min(4, Math.max(1.5, placed.durationSec - 0.6))),
          position: 'lower-third' as const,
        },
      ];
    }),
  ]
    .filter((o) => o.startSec < durationSec)
    .map((o) => ({ ...o, durationSec: round(Math.min(o.durationSec, durationSec - o.startSec)) }))
    .filter((o) => o.durationSec >= 0.5);

  const music: MusicClip[] = input.music
    ? [
        {
          path: input.music.path,
          startSec: 0,
          durationSec,
          gainDb: input.music.gainDb,
          duckToDb: input.music.duckToDb,
          fadeInSec: input.music.fadeInSec,
          fadeOutSec: input.music.fadeOutSec,
          license: input.music.license,
          attribution: input.music.attribution,
        },
      ]
    : [];

  return timelineSchema.parse({
    version: 1,
    width: input.width,
    height: input.height,
    fps: input.fps,
    durationSec,
    scenes,
    voiceover,
    music,
    sfx: (input.sfx ?? [])
      .filter((s) => s.atSec < durationSec)
      .map((s) => ({ path: s.path, startSec: round(s.atSec), durationSec: round(s.durationSec), gainDb: s.gainDb })),
    overlays,
    captions: input.captions ? { srtPath: input.captions.srtPath, burnIn: input.captions.burnIn, fontSize: 22 } : undefined,
    watermark: input.watermark,
    audio: { normalizeLufs: -16, truePeakDb: -1.5, voiceGainDb: 0 },
  });
}

/**
 * The shot list is a *proportional* plan — the scene agent decides relative pacing, not
 * absolute runtime. The cut is timed to the voice, so scene durations are scaled to the
 * narration that actually got synthesised. Without this a video ends up with minutes of
 * music-only footage after the narrator stops, or cuts off mid-sentence.
 */
export function fitScenesToNarration(scenes: SceneInput[], narrationTotalSec: number): SceneInput[] {
  if (scenes.length === 0 || narrationTotalSec <= 0) return scenes;

  // A short tail after the last word so the video does not stop on a hard consonant.
  const target = narrationTotalSec + 1.5;
  const planned = scenes.reduce((sum, s) => sum + s.durationSec, 0);
  if (planned <= 0) {
    const even = target / scenes.length;
    return scenes.map((s) => ({ ...s, durationSec: round(even) }));
  }

  const MIN = 2;
  const MAX = 25;
  const factor = target / planned;
  let out = scenes.map((s) => ({ ...s, durationSec: clamp(s.durationSec * factor, MIN, MAX) }));

  // Clamping loses (or gains) time; give the difference back to the scenes that have room.
  let drift = target - out.reduce((sum, s) => sum + s.durationSec, 0);
  for (let pass = 0; pass < 4 && Math.abs(drift) > 0.05; pass += 1) {
    const adjustable = out.filter((s) => (drift > 0 ? s.durationSec < MAX : s.durationSec > MIN));
    if (adjustable.length === 0) break;
    const share = drift / adjustable.length;
    out = out.map((s) =>
      adjustable.includes(s) ? { ...s, durationSec: clamp(s.durationSec + share, MIN, MAX) } : s,
    );
    drift = target - out.reduce((sum, s) => sum + s.durationSec, 0);
  }

  // Anything still unallocated (every scene at its cap) goes on the final scene.
  if (Math.abs(drift) > 0.05 && out.length > 0) {
    const last = out[out.length - 1]!;
    out[out.length - 1] = { ...last, durationSec: Math.max(MIN, last.durationSec + drift) };
  }

  return out.map((s) => ({ ...s, durationSec: round(s.durationSec) }));
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
