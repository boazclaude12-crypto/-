import { formatTimecode } from '../shared/time.js';

export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

export interface CaptionCue {
  index: number;
  start: number;
  end: number;
  text: string;
}

export interface CaptionOptions {
  /** Maximum characters per subtitle cue — two readable lines. */
  maxChars?: number;
  maxDurationSec?: number;
  maxLines?: number;
  /** Minimum gap before a pause is treated as a cue boundary. */
  gapSec?: number;
}

/**
 * Builds subtitle cues from word-level timings (spec §21).
 *
 * Cues break on sentence endings first, then on a pause, then on the character limit —
 * which is the order a human editor would use, and it is what keeps captions readable
 * instead of chopping mid-clause.
 */
export function buildCues(words: WordTiming[], opts: CaptionOptions = {}): CaptionCue[] {
  const maxChars = opts.maxChars ?? 84;
  const maxDuration = opts.maxDurationSec ?? 6;
  const gap = opts.gapSec ?? 0.6;

  const cues: CaptionCue[] = [];
  let current: WordTiming[] = [];

  const flush = () => {
    if (current.length === 0) return;
    const first = current[0]!;
    const last = current[current.length - 1]!;
    cues.push({
      index: cues.length + 1,
      start: first.start,
      end: Math.max(last.end, first.start + 0.4),
      text: wrap(current.map((w) => w.word).join(' '), Math.ceil(maxChars / (opts.maxLines ?? 2))),
    });
    current = [];
  };

  for (const [i, word] of words.entries()) {
    current.push(word);
    const next = words[i + 1];
    const text = current.map((w) => w.word).join(' ');
    const first = current[0]!;

    const endsSentence = /[.!?…。！？]["')\]]?$/.test(word.word);
    const tooLong = text.length >= maxChars;
    const tooSlow = word.end - first.start >= maxDuration;
    const pauseAhead = next !== undefined && next.start - word.end >= gap;

    if (!next || endsSentence || tooLong || tooSlow || pauseAhead) flush();
  }
  flush();

  return cues;
}

export function toSrt(cues: CaptionCue[]): string {
  return `${cues
    .map(
      (cue) =>
        `${cue.index}\n${formatTimecode(cue.start, true)} --> ${formatTimecode(cue.end, true)}\n${cue.text}`,
    )
    .join('\n\n')}\n`;
}

export function toVtt(cues: CaptionCue[]): string {
  const body = cues
    .map(
      (cue) =>
        `${cue.index}\n${formatTimecode(cue.start, true).replace(',', '.')} --> ${formatTimecode(
          cue.end,
          true,
        ).replace(',', '.')}\n${cue.text}`,
    )
    .join('\n\n');
  return `WEBVTT\n\n${body}\n`;
}

/**
 * Offsets a segment's word timings onto the master timeline. TTS returns timings relative
 * to each segment, so without this every caption after the first would be wrong.
 */
export function shiftTimings(words: WordTiming[], offsetSec: number): WordTiming[] {
  return words.map((w) => ({
    word: w.word,
    start: round(w.start + offsetSec),
    end: round(w.end + offsetSec),
  }));
}

/** Derives evenly-spread timings when a TTS provider returns no alignment at all. */
export function synthesizeTimings(text: string, startSec: number, durationSec: number): WordTiming[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const per = durationSec / words.length;
  return words.map((word, i) => ({
    word,
    start: round(startSec + i * per),
    end: round(startSec + (i + 1) * per),
  }));
}

/**
 * Locates where each block of narration actually starts, using the word timings the TTS
 * provider returned. Character-proportion estimates drift badly on real scripts; word
 * timings are exact, and we already have them for subtitles.
 */
export function locateBlocks(
  blocks: Array<{ title: string; text: string }>,
  words: WordTiming[],
): Array<{ title: string; startSec: number }> {
  const out: Array<{ title: string; startSec: number }> = [];
  let wordIndex = 0;
  for (const block of blocks) {
    const start = words[Math.min(wordIndex, Math.max(0, words.length - 1))]?.start ?? 0;
    out.push({ title: block.title, startSec: start });
    wordIndex += block.text.trim().split(/\s+/).filter(Boolean).length;
    if (wordIndex >= words.length) break;
  }
  return out;
}

/**
 * YouTube chapters from the script's section boundaries (spec §30). The first chapter must
 * start at 00:00 and chapters must be at least 10 seconds apart, or YouTube ignores them.
 */
export function buildChapters(
  sections: Array<{ title: string; startSec: number }>,
  totalDurationSec: number,
): Array<{ startSec: number; title: string }> {
  const sorted = [...sections].sort((a, b) => a.startSec - b.startSec);
  const out: Array<{ startSec: number; title: string }> = [];
  for (const section of sorted) {
    const start = out.length === 0 ? 0 : Math.round(section.startSec);
    if (start >= totalDurationSec - 5) break;
    const previous = out[out.length - 1];
    if (previous && start - previous.startSec < 10) continue;
    out.push({ startSec: start, title: section.title.slice(0, 100) });
  }
  // Fewer than three chapters is not a valid chapter list on YouTube — omit them entirely.
  return out.length >= 3 ? out : [];
}

function wrap(text: string, perLine: number): string {
  if (text.length <= perLine) return text;
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && line.length + word.length + 1 > perLine) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 2).join('\n');
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
