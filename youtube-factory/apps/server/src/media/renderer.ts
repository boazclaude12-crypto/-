import { join } from 'node:path';
import type { AppConfig } from '../config/index.js';
import type { Logger } from '../shared/logger.js';
import { nullLogger } from '../shared/logger.js';
import { MediaTools, escapeFilterPath, escapeFilterText, type MediaInfo } from './ffmpeg.js';
import type { Timeline, TimelineScene } from './timeline.js';

export interface RenderOptions {
  outputPath: string;
  crf?: number;
  preset?: string;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

export interface RenderPlan {
  args: string[];
  /** The compiled filter graph — kept for the video page's Logs tab. */
  filterGraph: string;
  inputs: string[];
  expectedDurationSec: number;
}

export interface RenderResult extends RenderPlan {
  outputPath: string;
  info: MediaInfo;
  commandLine: string;
}

const XFADE_TRANSITIONS: Record<string, string> = {
  fade: 'fade',
  dissolve: 'dissolve',
  slideleft: 'slideleft',
  slideright: 'slideright',
};

/**
 * Compiles a `Timeline` into a single FFmpeg invocation (spec §24, §25, §68).
 *
 * `plan()` is pure — timeline in, argument vector out — so the filter graph is unit-testable
 * without executing anything. `render()` runs that plan and probes the result.
 *
 * Video path: normalise → Ken Burns on stills → join (concat for an all-cut edit, an xfade
 * chain otherwise) → text overlays → burned-in captions → watermark.
 * Audio path: delay each narration clip onto the timeline → mix → duck the music against the
 * narration with sidechaincompress → mix in SFX → loudnorm to the target LUFS.
 */
export class FfmpegRenderer {
  private readonly media: MediaTools;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger = nullLogger,
  ) {
    this.media = new MediaTools(config.media.ffmpegPath, config.media.ffprobePath);
  }

  get tools(): MediaTools {
    return this.media;
  }

  plan(timeline: Timeline, opts: RenderOptions): RenderPlan {
    const { width, height, fps } = timeline;
    const inputs: string[] = [];
    const args: string[] = [];
    const filters: string[] = [];

    const useXfade = timeline.scenes.some(
      (s, i) => i < timeline.scenes.length - 1 && s.transition.type !== 'cut' && s.transition.durationSec > 0,
    );

    // ── video inputs ────────────────────────────────────────────────────────
    timeline.scenes.forEach((scene, i) => {
      // A scene's source runs slightly long when it cross-fades, because the transition
      // consumes the tail. See the layout invariant in timeline.ts.
      const sourceLength = scene.durationSec + (useXfade ? transitionLength(scene, fps) : 0);
      if (scene.source.kind === 'image') {
        args.push('-loop', '1', '-t', sourceLength.toFixed(3), '-i', scene.source.path ?? '');
      } else if (scene.source.kind === 'color') {
        args.push(
          '-f',
          'lavfi',
          '-t',
          sourceLength.toFixed(3),
          '-i',
          `color=c=${scene.source.color ?? 'black'}:s=${width}x${height}:r=${fps}`,
        );
      } else {
        args.push('-t', sourceLength.toFixed(3), '-i', scene.source.path ?? '');
      }
      inputs.push(scene.source.path ?? scene.source.color ?? 'color');
      filters.push(this.sceneFilter(scene, i, sourceLength, timeline));
    });

    // ── audio inputs ────────────────────────────────────────────────────────
    const voiceStart = timeline.scenes.length;
    for (const clip of timeline.voiceover) {
      args.push('-i', clip.path);
      inputs.push(clip.path);
    }
    const musicStart = voiceStart + timeline.voiceover.length;
    for (const clip of timeline.music) {
      args.push('-stream_loop', '-1', '-i', clip.path);
      inputs.push(clip.path);
    }
    const sfxStart = musicStart + timeline.music.length;
    for (const clip of timeline.sfx) {
      args.push('-i', clip.path);
      inputs.push(clip.path);
    }
    const watermarkIndex = sfxStart + timeline.sfx.length;
    if (timeline.watermark) {
      args.push('-i', timeline.watermark.path);
      inputs.push(timeline.watermark.path);
    }

    // ── join scenes ─────────────────────────────────────────────────────────
    let videoLabel: string;
    if (timeline.scenes.length === 1) {
      videoLabel = '[v0]';
    } else if (!useXfade) {
      const chain = timeline.scenes.map((_, i) => `[v${i}]`).join('');
      filters.push(`${chain}concat=n=${timeline.scenes.length}:v=1:a=0[vcat]`);
      videoLabel = '[vcat]';
    } else {
      let previous = '[v0]';
      let offset = 0;
      for (let i = 1; i < timeline.scenes.length; i += 1) {
        const outgoing = timeline.scenes[i - 1]!;
        offset += outgoing.durationSec;
        const duration = transitionLength(outgoing, fps);
        const transition = XFADE_TRANSITIONS[outgoing.transition.type] ?? 'fade';
        const label = i === timeline.scenes.length - 1 ? '[vcat]' : `[vx${i}]`;
        filters.push(
          `${previous}[v${i}]xfade=transition=${transition}:duration=${duration.toFixed(
            3,
          )}:offset=${offset.toFixed(3)}${label}`,
        );
        previous = label;
      }
      videoLabel = '[vcat]';
    }

    // ── overlays, captions, watermark ───────────────────────────────────────
    let step = 0;
    for (const overlay of timeline.overlays) {
      const next = `[vo${step}]`;
      filters.push(`${videoLabel}${this.drawText(overlay, timeline)}${next}`);
      videoLabel = next;
      step += 1;
    }

    if (timeline.captions?.burnIn) {
      const next = '[vsub]';
      filters.push(
        `${videoLabel}subtitles='${escapeFilterPath(timeline.captions.srtPath)}':force_style='FontSize=${
          timeline.captions.fontSize
        },PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=3,Outline=2,Shadow=0,MarginV=48'${next}`,
      );
      videoLabel = next;
    }

    if (timeline.watermark) {
      const margin = timeline.watermark.marginPx;
      const pos = {
        tl: `${margin}:${margin}`,
        tr: `W-w-${margin}:${margin}`,
        bl: `${margin}:H-h-${margin}`,
        br: `W-w-${margin}:H-h-${margin}`,
      }[timeline.watermark.position];
      filters.push(
        `[${watermarkIndex}:v]format=rgba,colorchannelmixer=aa=${timeline.watermark.opacity}[wm]`,
        `${videoLabel}[wm]overlay=${pos}[vwm]`,
      );
      videoLabel = '[vwm]';
    }

    const finalVideo = '[vout]';
    filters.push(`${videoLabel}format=yuv420p,fps=${fps}${finalVideo}`);

    // ── audio graph ─────────────────────────────────────────────────────────
    const audioLabel = this.audioGraph(timeline, filters, { voiceStart, musicStart, sfxStart });

    const filterGraph = filters.join(';');
    const output: string[] = [
      '-filter_complex',
      filterGraph,
      '-map',
      finalVideo,
      ...(audioLabel ? ['-map', audioLabel] : []),
      '-c:v',
      'libx264',
      '-preset',
      opts.preset ?? this.config.media.preset,
      '-crf',
      String(opts.crf ?? this.config.media.crf),
      '-pix_fmt',
      'yuv420p',
      '-profile:v',
      'high',
      '-level',
      '4.1',
      '-r',
      String(fps),
      '-movflags',
      '+faststart',
      ...(audioLabel ? ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2'] : ['-an']),
      '-t',
      timeline.durationSec.toFixed(3),
      opts.outputPath,
    ];

    return {
      args: [...args, ...output],
      filterGraph,
      inputs,
      expectedDurationSec: timeline.durationSec,
    };
  }

  private sceneFilter(scene: TimelineScene, index: number, sourceLength: number, timeline: Timeline): string {
    const { width, height, fps } = timeline;
    const steps: string[] = [];

    if (scene.source.kind === 'image' && scene.kenBurns?.enabled !== false) {
      const frames = Math.max(1, Math.round(sourceLength * fps));
      const zoomTo = scene.kenBurns?.zoomTo ?? 1.12;
      const perFrame = (zoomTo - 1) / frames;
      // zoompan samples its input once per output frame, so the source is upscaled first —
      // otherwise the zoom visibly stair-steps.
      steps.push(
        `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase`,
        `crop=${width * 2}:${height * 2}`,
        `zoompan=z='min(zoom+${perFrame.toFixed(6)},${zoomTo})':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${fps}`,
      );
    } else {
      steps.push(
        `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
      );
    }

    steps.push('setsar=1', `fps=${fps}`, `trim=duration=${sourceLength.toFixed(3)}`, 'setpts=PTS-STARTPTS');
    return `[${index}:v]${steps.join(',')}[v${index}]`;
  }

  private drawText(overlay: Timeline['overlays'][number], timeline: Timeline): string {
    const fontSize = overlay.fontSize ?? Math.round(timeline.height / 22);
    const y = {
      top: 'h*0.08',
      center: '(h-text_h)/2',
      bottom: 'h-text_h-h*0.08',
      'lower-third': 'h*0.74',
    }[overlay.position];
    const end = overlay.startSec + overlay.durationSec;
    return (
      `drawtext=text='${escapeFilterText(overlay.text)}'` +
      `:fontcolor=white:fontsize=${fontSize}:box=1:boxcolor=black@0.55:boxborderw=18` +
      `:x=(w-text_w)/2:y=${y}` +
      `:enable='between(t,${overlay.startSec.toFixed(2)},${end.toFixed(2)})'`
    );
  }

  /**
   * Builds the audio bus and returns its label, or null when the timeline is silent.
   * Ducking uses `sidechaincompress` keyed off the narration bus, which is how a broadcast
   * mix does it — the bed drops only while someone is speaking (spec §25).
   */
  private audioGraph(
    timeline: Timeline,
    filters: string[],
    offsets: { voiceStart: number; musicStart: number; sfxStart: number },
  ): string | null {
    const buses: string[] = [];

    let voiceLabel: string | null = null;
    if (timeline.voiceover.length > 0) {
      timeline.voiceover.forEach((clip, i) => {
        const delayMs = Math.round(clip.startSec * 1000);
        const gain = clip.gainDb + timeline.audio.voiceGainDb;
        filters.push(
          `[${offsets.voiceStart + i}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,` +
            `adelay=${delayMs}|${delayMs}` +
            (gain !== 0 ? `,volume=${gain}dB` : '') +
            `[a${i}]`,
        );
      });
      const chain = timeline.voiceover.map((_, i) => `[a${i}]`).join('');
      filters.push(
        `${chain}amix=inputs=${timeline.voiceover.length}:duration=longest:normalize=0,` +
          `apad=whole_dur=${timeline.durationSec.toFixed(3)}[voice]`,
      );
      voiceLabel = '[voice]';
    }

    if (timeline.music.length > 0) {
      const music = timeline.music[0]!;
      const fadeOutStart = Math.max(0, timeline.durationSec - music.fadeOutSec);
      filters.push(
        `[${offsets.musicStart}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,` +
          `atrim=duration=${timeline.durationSec.toFixed(3)},asetpts=PTS-STARTPTS,` +
          `volume=${music.gainDb}dB,` +
          `afade=t=in:st=0:d=${music.fadeInSec},afade=t=out:st=${fadeOutStart.toFixed(2)}:d=${music.fadeOutSec}[musicraw]`,
      );

      if (voiceLabel) {
        // The narration bus is split: one copy feeds the mix, the other keys the compressor.
        filters.push(`${voiceLabel}asplit=2[voicemix][voicekey]`);
        filters.push(
          `[musicraw][voicekey]sidechaincompress=threshold=0.05:ratio=12:attack=25:release=450:makeup=1[music]`,
        );
        buses.push('[voicemix]', '[music]');
        voiceLabel = null;
      } else {
        filters.push('[musicraw]anull[music]');
        buses.push('[music]');
      }
    }

    if (voiceLabel) buses.push(voiceLabel);

    timeline.sfx.forEach((clip, i) => {
      const delayMs = Math.round(clip.startSec * 1000);
      filters.push(
        `[${offsets.sfxStart + i}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,` +
          `volume=${clip.gainDb}dB,adelay=${delayMs}|${delayMs}[s${i}]`,
      );
      buses.push(`[s${i}]`);
    });

    if (buses.length === 0) return null;

    const mixed = buses.length === 1 ? buses[0]! : '[amixed]';
    if (buses.length > 1) {
      filters.push(`${buses.join('')}amix=inputs=${buses.length}:duration=first:normalize=0${mixed}`);
    }
    filters.push(
      `${mixed}loudnorm=I=${timeline.audio.normalizeLufs}:TP=${timeline.audio.truePeakDb}:LRA=11,` +
        `atrim=duration=${timeline.durationSec.toFixed(3)},asetpts=PTS-STARTPTS,` +
        `aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[aout]`,
    );
    return '[aout]';
  }

  async render(timeline: Timeline, opts: RenderOptions): Promise<RenderResult> {
    const plan = this.plan(timeline, opts);
    this.logger.info('render starting', {
      scenes: timeline.scenes.length,
      durationSec: timeline.durationSec,
      resolution: `${timeline.width}x${timeline.height}`,
    });

    await this.media.run(plan.args, {
      timeoutMs: Math.max(900_000, timeline.durationSec * 8_000),
      signal: opts.signal,
      onStderr: (chunk) => {
        if (!opts.onProgress) return;
        const match = /time=(\d+):(\d+):(\d+\.\d+)/.exec(chunk);
        if (!match) return;
        const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
        opts.onProgress(Math.min(100, Math.round((seconds / timeline.durationSec) * 100)));
      },
    });

    const info = await this.media.probe(opts.outputPath);
    this.logger.info('render complete', {
      durationSec: info.durationSec,
      sizeBytes: info.sizeBytes,
      videoCodec: info.videoCodec,
      audioCodec: info.audioCodec,
    });

    return {
      ...plan,
      outputPath: opts.outputPath,
      info,
      commandLine: `${this.config.media.ffmpegPath} ${plan.args.map(quote).join(' ')}`,
    };
  }

  /** Renders a 1280x720 thumbnail plate with a headline overlay (spec §27). */
  async renderThumbnail(
    backgroundPath: string,
    overlayText: string,
    outputPath: string,
  ): Promise<string> {
    await this.media.run([
      '-i',
      backgroundPath,
      '-vf',
      [
        'scale=1280:720:force_original_aspect_ratio=increase',
        'crop=1280:720',
        'eq=contrast=1.15:saturation=1.2',
        `drawtext=text='${escapeFilterText(overlayText)}':fontcolor=white:fontsize=104:` +
          'borderw=6:bordercolor=black@0.9:x=(w-text_w)/2:y=h-text_h-70',
      ].join(','),
      '-frames:v',
      '1',
      '-q:v',
      '2',
      outputPath,
    ]);
    return outputPath;
  }
}

function transitionLength(scene: TimelineScene, fps: number): number {
  if (scene.transition.type === 'cut' || scene.transition.durationSec <= 0) return 1 / fps;
  return scene.transition.durationSec;
}

function quote(arg: string): string {
  return /[\s;|&$'"<>]/.test(arg) ? `'${arg.replace(/'/g, `'\\''`)}'` : arg;
}

export { join as joinPath };
