import { stat } from 'node:fs/promises';
import type { MediaTools, MediaInfo } from '../media/ffmpeg.js';
import type { Timeline } from '../media/timeline.js';
import type { QcCheck } from '../shared/schemas.js';
import { ngramOverlap } from '../shared/text.js';

export interface TechnicalQcInput {
  /**
   * `render` runs right after the master file is produced, when the thumbnail and metadata
   * legitimately do not exist yet — those are reported but do not block. `publish` runs at
   * the upload gate, where everything in spec §32 must be present.
   */
  stage?: 'render' | 'publish';
  renderPath: string;
  timeline: Timeline;
  expectedDurationSec: number;
  thumbnailPresent: boolean;
  titlePresent: boolean;
  descriptionPresent: boolean;
  captionsPresent: boolean;
  sceneCount: number;
  assetCount: number;
  licences: string[];
}

export interface TechnicalQcResult {
  checks: QcCheck[];
  info: MediaInfo;
  probe: Record<string, unknown>;
  passed: boolean;
  score: number;
}

const ALLOWED_LICENCES = new Set(['owned', 'royalty_free', 'royalty-free', 'cc_by', 'cc0', 'licensed', 'generated']);

/**
 * Automated quality control (spec §26). Every check here is a measurement, not an opinion —
 * the QC agent is given these results and decides, but a failed blocker overrides it.
 */
export async function runTechnicalChecks(
  media: MediaTools,
  input: TechnicalQcInput,
): Promise<TechnicalQcResult> {
  const checks: QcCheck[] = [];
  const add = (name: string, passed: boolean, severity: QcCheck['severity'], detail: string) =>
    checks.push({ name, passed, severity, detail });

  // 1. the file exists and is not empty
  let sizeBytes = 0;
  try {
    sizeBytes = (await stat(input.renderPath)).size;
  } catch {
    sizeBytes = 0;
  }
  add('render_exists', sizeBytes > 1024, 'blocker', `Rendered file is ${sizeBytes} bytes.`);

  const info = await media.probe(input.renderPath);

  add('video_stream', info.hasVideo, 'blocker', info.hasVideo ? `${info.width}x${info.height} ${info.videoCodec}` : 'No video stream found.');
  add('audio_stream', info.hasAudio, 'blocker', info.hasAudio ? `${info.audioCodec}, ${info.audioChannels} ch` : 'No audio stream found.');

  // 2. duration matches the plan
  const drift = Math.abs(info.durationSec - input.expectedDurationSec);
  add(
    'duration_match',
    drift <= Math.max(1.5, input.expectedDurationSec * 0.03),
    'blocker',
    `Rendered ${info.durationSec.toFixed(2)}s against a planned ${input.expectedDurationSec.toFixed(
      2,
    )}s (drift ${drift.toFixed(2)}s).`,
  );

  // The blocker is "the render matches what was planned", not a fixed HD floor — a channel
  // may legitimately be configured for a different resolution or aspect ratio.
  const matchesPlan = info.width === input.timeline.width && info.height === input.timeline.height;
  add(
    'resolution',
    matchesPlan,
    'blocker',
    matchesPlan
      ? `Output is ${info.width}x${info.height}, as planned.`
      : `Output is ${info.width}x${info.height} but the timeline specified ${input.timeline.width}x${input.timeline.height}.`,
  );
  // Below 720p is publishable but worth flagging.
  add(
    'hd_or_better',
    (info.width ?? 0) >= 1280 && (info.height ?? 0) >= 720,
    'warn',
    `Output is ${info.width}x${info.height}; YouTube favours 1920x1080 or better.`,
  );

  // 3. no long stretches of black — these are usually a failed scene asset
  const black = await media.detectBlackFrames(input.renderPath, 1.0);
  const blackTotal = black.reduce((sum, b) => sum + (b.end - b.start), 0);
  add(
    'no_black_frames',
    blackTotal < Math.max(2, info.durationSec * 0.03),
    'blocker',
    black.length === 0
      ? 'No black segments longer than one second.'
      : `${black.length} black segments totalling ${blackTotal.toFixed(1)}s.`,
  );

  // 4. no long silence in the middle of the video
  const silence = await media.detectSilence(input.renderPath, -50, 4);
  const midSilence = silence.filter((s) => s.start > 2 && s.end < info.durationSec - 3);
  add(
    'no_dead_air',
    midSilence.length === 0,
    'blocker',
    midSilence.length === 0
      ? 'No silence longer than four seconds inside the body of the video.'
      : `${midSilence.length} silent stretches, the longest ${Math.max(
          ...midSilence.map((s) => s.end - s.start),
        ).toFixed(1)}s.`,
  );

  // 5. the mix actually landed on target
  const loudness = await media.measureLoudness(input.renderPath);
  if (loudness) {
    const target = input.timeline.audio.normalizeLufs;
    add(
      'loudness',
      Math.abs(loudness.integratedLufs - target) <= 2,
      'warn',
      `Integrated loudness ${loudness.integratedLufs.toFixed(1)} LUFS against a ${target} LUFS target; true peak ${loudness.truePeakDb.toFixed(
        1,
      )} dBTP.`,
    );
  }

  // 6. every scene produced an asset
  add(
    'all_scenes_have_assets',
    input.assetCount >= input.sceneCount,
    'blocker',
    `${input.assetCount} assets for ${input.sceneCount} scenes.`,
  );

  // 7. no duplicate consecutive scene sources — a sign of a silently reused generation
  const duplicates = countConsecutiveDuplicates(input.timeline.scenes.map((s) => s.source.path ?? ''));
  add(
    'no_duplicate_scenes',
    duplicates === 0,
    'warn',
    duplicates === 0 ? 'No two consecutive scenes share a source.' : `${duplicates} consecutive scene pairs reuse the same source file.`,
  );

  // 8. publish-gate metadata (spec §32). At the render stage these stages have not run yet,
  // so they are reported for visibility but only block at the publish gate.
  const metadataSeverity: QcCheck['severity'] = input.stage === 'publish' ? 'blocker' : 'info';
  add('thumbnail_present', input.thumbnailPresent, metadataSeverity, input.thumbnailPresent ? 'Thumbnail selected.' : 'Not generated yet — the thumbnail stage runs after this one.');
  add('title_present', input.titlePresent, metadataSeverity, input.titlePresent ? 'Title set.' : 'Not generated yet — the SEO stage runs after this one.');
  add('description_present', input.descriptionPresent, metadataSeverity, input.descriptionPresent ? 'Description set.' : 'Not generated yet — the SEO stage runs after this one.');
  add('captions_present', input.captionsPresent, 'warn', input.captionsPresent ? 'Subtitles generated.' : 'No subtitle track.');

  // 9. licensing (spec §22, §53)
  const bad = input.licences.filter((l) => l && !ALLOWED_LICENCES.has(l.toLowerCase()));
  add(
    'licences_clear',
    bad.length === 0,
    'blocker',
    bad.length === 0 ? 'Every asset carries a usable licence.' : `Assets with unusable licences: ${bad.join(', ')}.`,
  );

  const blockersFailed = checks.filter((c) => !c.passed && c.severity === 'blocker');
  const weight = (c: QcCheck) => (c.severity === 'blocker' ? 3 : c.severity === 'warn' ? 1 : 0.5);
  const totalWeight = checks.reduce((sum, c) => sum + weight(c), 0);
  const earned = checks.filter((c) => c.passed).reduce((sum, c) => sum + weight(c), 0);

  return {
    checks,
    info,
    probe: {
      durationSec: info.durationSec,
      sizeBytes: info.sizeBytes || sizeBytes,
      resolution: `${info.width}x${info.height}`,
      fps: info.fps,
      videoCodec: info.videoCodec,
      audioCodec: info.audioCodec,
      blackSegments: black.length,
      silentSegments: silence.length,
      integratedLufs: loudness?.integratedLufs,
    },
    passed: blockersFailed.length === 0,
    score: totalWeight === 0 ? 0 : Math.round((earned / totalWeight) * 100),
  };
}

/**
 * Originality guard (spec §53). Flags a script that reproduces a single source too closely —
 * research-driven writing should share facts with its sources, not sentences.
 */
export function checkOriginality(
  script: string,
  sources: Array<{ source: string; claim: string }>,
  threshold = 0.18,
): { passed: boolean; worst: { source: string; overlap: number } | null; score: number } {
  let worst: { source: string; overlap: number } | null = null;
  for (const source of sources) {
    const overlap = ngramOverlap(script, source.claim, 8);
    if (!worst || overlap > worst.overlap) worst = { source: source.source, overlap };
  }
  const overlap = worst?.overlap ?? 0;
  return {
    passed: overlap < threshold,
    worst,
    score: Math.round(Math.max(0, 1 - overlap / threshold) * 100),
  };
}

function countConsecutiveDuplicates(paths: string[]): number {
  let count = 0;
  for (let i = 1; i < paths.length; i += 1) {
    if (paths[i] && paths[i] === paths[i - 1]) count += 1;
  }
  return count;
}
