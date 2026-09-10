import { join } from 'node:path';
import type { MediaTools } from './ffmpeg.js';

export type SfxKind = 'whoosh' | 'impact' | 'transition' | 'ambient' | 'riser';

/**
 * Sound design (spec §23). Each effect is synthesised with FFmpeg rather than shipped as an
 * audio file, so the system owns every sound it uses outright and there is no licence
 * question to answer. They are short, subtle and deliberately unglamorous — the rule from
 * the specification is "don't overdo it".
 */
const RECIPES: Record<SfxKind, { durationSec: number; filter: string }> = {
  // Filtered noise sweeping upward — the classic transition whoosh.
  whoosh: {
    durationSec: 0.8,
    filter:
      'highpass=f=300,lowpass=f=6000,afade=t=in:st=0:d=0.35:curve=exp,afade=t=out:st=0.4:d=0.4,volume=0.5',
  },
  // Low sine thump with a fast decay.
  impact: {
    durationSec: 0.6,
    filter: 'lowpass=f=220,afade=t=out:st=0.05:d=0.55:curve=exp,volume=0.7',
  },
  transition: {
    durationSec: 0.5,
    filter: 'bandpass=f=1400:width_type=o:w=2,afade=t=in:st=0:d=0.1,afade=t=out:st=0.2:d=0.3,volume=0.4',
  },
  ambient: {
    durationSec: 4,
    filter: 'lowpass=f=900,afade=t=in:st=0:d=1.5,afade=t=out:st=2.5:d=1.5,volume=0.2',
  },
  riser: {
    durationSec: 1.5,
    filter: 'highpass=f=200,afade=t=in:st=0:d=1.4:curve=exp,volume=0.45',
  },
};

const SOURCE: Record<SfxKind, (durationSec: number) => string> = {
  whoosh: (d) => `anoisesrc=color=brown:duration=${d}:sample_rate=48000:amplitude=0.6`,
  impact: (d) => `sine=frequency=60:duration=${d}:sample_rate=48000`,
  transition: (d) => `anoisesrc=color=white:duration=${d}:sample_rate=48000:amplitude=0.4`,
  ambient: (d) => `anoisesrc=color=pink:duration=${d}:sample_rate=48000:amplitude=0.3`,
  riser: (d) => `anoisesrc=color=violet:duration=${d}:sample_rate=48000:amplitude=0.4`,
};

export interface SynthesizedSfx {
  kind: SfxKind;
  path: string;
  durationSec: number;
}

export async function synthesizeSfx(
  media: MediaTools,
  kind: SfxKind,
  dir: string,
): Promise<SynthesizedSfx> {
  const recipe = RECIPES[kind];
  const path = join(dir, `sfx-${kind}.wav`);
  await media.run([
    '-f',
    'lavfi',
    '-i',
    SOURCE[kind](recipe.durationSec),
    '-af',
    recipe.filter,
    '-t',
    String(recipe.durationSec),
    '-ac',
    '2',
    '-ar',
    '48000',
    '-c:a',
    'pcm_s16le',
    path,
  ]);
  return { kind, path, durationSec: recipe.durationSec };
}

export function sfxDuration(kind: SfxKind): number {
  return RECIPES[kind].durationSec;
}
