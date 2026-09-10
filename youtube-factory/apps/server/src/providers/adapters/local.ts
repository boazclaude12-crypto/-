import { join } from 'node:path';
import { readFile, rm } from 'node:fs/promises';
import type { AppConfig } from '../../config/index.js';
import { MediaTools, escapeFilterText, systemTempDir } from '../../media/ffmpeg.js';
import type { Capability } from '../../shared/types.js';
import { usd } from '../../shared/types.js';
import { estimate } from '../rates.js';
import type {
  AIProvider,
  EstimateInput,
  ImageCapable,
  ImageRequest,
  ImageResponse,
  MusicCapable,
  MusicRequest,
  MusicResponse,
  ProviderHealth,
  VideoCapable,
  VideoRequest,
  VideoResponse,
} from '../types.js';

/**
 * Zero-cost local visual provider (spec §18, §19, §64).
 *
 * This is *not* a stock-footage API — it renders deterministic gradient/typographic plates
 * with FFmpeg. Its job is to be the always-available last link in the fallback chain: when
 * every generative provider is unavailable, out of credits or over budget, a scene still
 * gets a usable, licence-clean visual instead of the pipeline dying. It is also what makes
 * the offline acceptance run produce a real MP4.
 */
export class LocalVisualProvider implements AIProvider, ImageCapable, VideoCapable, MusicCapable {
  readonly key = 'local';
  readonly name = 'Local FFmpeg generator';
  readonly capabilities: readonly Capability[] = ['generateImage', 'generateVideo', 'generateMusic'];
  private readonly media: MediaTools;

  constructor(private readonly config: AppConfig) {
    this.media = new MediaTools(config.media.ffmpegPath, config.media.ffprobePath);
  }

  isConfigured(): boolean {
    return true;
  }

  missingConfig(): string[] {
    return [];
  }

  estimateCost(_input: EstimateInput) {
    return usd(0);
  }

  async health(): Promise<ProviderHealth> {
    const ok = await this.media.available();
    return { ok, detail: ok ? 'FFmpeg present' : 'FFmpeg not found on PATH' };
  }

  async generateImage(req: ImageRequest): Promise<ImageResponse> {
    const dir = await systemTempDir('plate-');
    const out = join(dir, 'plate.png');
    const palette = paletteFor(req.prompt);
    const caption = escapeFilterText(headline(req.prompt));

    try {
      await this.media.run([
        '-f',
        'lavfi',
        '-i',
        `gradients=size=${req.width}x${req.height}:c0=${palette.from}:c1=${palette.to}:x0=0:y0=0:x1=${req.width}:y1=${req.height}:d=1`,
        '-vf',
        [
          `drawbox=x=0:y=${Math.round(req.height * 0.62)}:w=${req.width}:h=${Math.round(req.height * 0.38)}:color=black@0.45:t=fill`,
          `drawtext=text='${caption}':fontcolor=white:fontsize=${Math.round(req.height / 16)}:x=(w-text_w)/2:y=h*0.72:line_spacing=12`,
        ].join(','),
        '-frames:v',
        '1',
        out,
      ]);
      const bytes = await readFile(out);
      return {
        images: [{ bytes, mimeType: 'image/png', width: req.width, height: req.height }],
        usage: {
          inputUnits: 0,
          outputUnits: 1,
          unit: 'image',
          model: 'ffmpeg-gradient',
          cost: usd(0),
        },
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /**
   * Ken Burns motion over a still — the "image + motion instead of full video generation"
   * strategy the cost optimiser picks for low-importance scenes (spec §18, §19).
   */
  async generateVideo(req: VideoRequest): Promise<VideoResponse> {
    const dir = await systemTempDir('clip-');
    const out = join(dir, 'clip.mp4');
    const { width, height, fps } = this.config.media;
    const frames = Math.max(1, Math.round(req.durationSec * fps));

    try {
      let source: string;
      if (req.imageUrl?.startsWith('file://')) {
        source = req.imageUrl.slice('file://'.length);
      } else {
        const plate = await this.generateImage({
          prompt: req.prompt,
          width,
          height,
          count: 1,
        });
        source = join(dir, 'source.png');
        const { writeFile } = await import('node:fs/promises');
        await writeFile(source, plate.images[0]?.bytes ?? Buffer.alloc(0));
      }

      // zoompan works on an upscaled copy so the slow zoom stays free of stair-stepping.
      await this.media.run([
        '-loop',
        '1',
        '-i',
        source,
        '-vf',
        [
          `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase`,
          `crop=${width * 2}:${height * 2}`,
          `zoompan=z='min(zoom+0.0008,1.12)':d=${frames}:s=${width}x${height}:fps=${fps}`,
          'format=yuv420p',
        ].join(','),
        '-t',
        String(req.durationSec),
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '22',
        '-an',
        out,
      ]);

      const bytes = await readFile(out);
      return {
        video: {
          bytes,
          mimeType: 'video/mp4',
          durationSec: req.durationSec,
          width,
          height,
        },
        usage: {
          inputUnits: 0,
          outputUnits: req.durationSec,
          unit: 'second',
          model: 'ffmpeg-kenburns',
          cost: usd(0),
        },
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /**
   * Generates a soft, royalty-free-by-construction ambient bed. The system owns this output
   * outright, which satisfies the licensing rule in spec §22 without touching third-party
   * music.
   */
  async generateMusic(req: MusicRequest): Promise<MusicResponse> {
    const dir = await systemTempDir('music-');
    const out = join(dir, 'bed.m4a');
    const chord = chordFor(req.mood);
    try {
      const inputs = chord.flatMap((freq) => [
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=${freq}:duration=${Math.ceil(req.durationSec)}:sample_rate=48000`,
      ]);
      const mix = chord.map((_, i) => `[${i}:a]`).join('');
      await this.media.run([
        ...inputs,
        '-filter_complex',
        `${mix}amix=inputs=${chord.length}:duration=longest:normalize=1[m];` +
          `[m]tremolo=f=0.2:d=0.35,lowpass=f=1200,afade=t=in:st=0:d=2,afade=t=out:st=${Math.max(0, req.durationSec - 3)}:d=3,volume=-20dB[a]`,
        '-map',
        '[a]',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-t',
        String(req.durationSec),
        out,
      ]);
      const bytes = await readFile(out);
      return {
        audio: { bytes, mimeType: 'audio/mp4', durationSec: req.durationSec },
        title: `Generated ${req.mood} bed`,
        license: 'owned',
        attribution: undefined,
        usage: {
          inputUnits: 0,
          outputUnits: req.durationSec,
          unit: 'second',
          model: 'ffmpeg-ambient',
          cost: estimate(this.key, { capability: 'generateMusic', seconds: req.durationSec }),
        },
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

/** Deterministic palette so the same prompt always yields the same plate. */
function paletteFor(prompt: string): { from: string; to: string } {
  const palettes = [
    { from: '0x1e293b', to: '0x0f172a' },
    { from: '0x312e81', to: '0x1e1b4b' },
    { from: '0x134e4a', to: '0x042f2e' },
    { from: '0x7c2d12', to: '0x431407' },
    { from: '0x1e3a8a', to: '0x172554' },
    { from: '0x4a044e', to: '0x2e1065' },
  ];
  let hash = 0;
  for (const ch of prompt) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return palettes[hash % palettes.length]!;
}

function chordFor(mood: string): number[] {
  const m = mood.toLowerCase();
  if (m.includes('tense') || m.includes('dark')) return [110, 130.81, 164.81];
  if (m.includes('upbeat') || m.includes('energetic')) return [146.83, 185, 220];
  if (m.includes('epic') || m.includes('cinematic')) return [130.81, 196, 261.63];
  return [130.81, 164.81, 196];
}

/** Two short lines of the prompt, for the typographic plate. */
function headline(prompt: string): string {
  const words = prompt.replace(/\s+/g, ' ').trim().split(' ').slice(0, 8);
  const mid = Math.ceil(words.length / 2);
  return `${words.slice(0, mid).join(' ')}\n${words.slice(mid).join(' ')}`.trim();
}
