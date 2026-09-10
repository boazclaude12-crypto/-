import { spawn } from 'node:child_process';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { AppError } from '../shared/errors.js';

export interface FfmpegResult {
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  timeoutMs?: number;
  /** Called with each stderr chunk — used to surface render progress. */
  onStderr?: (chunk: string) => void;
  signal?: AbortSignal;
}

/**
 * Runs an ffmpeg/ffprobe process. Arguments are passed as an array and the shell is never
 * involved, so prompt text and file names cannot become shell metacharacters.
 */
export function runBinary(
  bin: string,
  args: string[],
  opts: RunOptions = {},
): Promise<FfmpegResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      child.kill('SIGKILL');
      reject(new AppError('media_timeout', `${bin} timed out after ${opts.timeoutMs ?? 900_000}ms`, {
        retryable: true,
      }));
    }, opts.timeoutMs ?? 900_000);
    timer.unref?.();

    opts.signal?.addEventListener('abort', () => child.kill('SIGKILL'), { once: true });

    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      const text = d.toString();
      // ffmpeg is extremely chatty; keep only the tail so a long render cannot exhaust memory.
      stderr = (stderr + text).slice(-60_000);
      opts.onStderr?.(text);
    });
    child.on('error', (err) => {
      settled = true;
      clearTimeout(timer);
      reject(
        new AppError('media_spawn_failed', `Could not run ${bin}: ${err.message}. Is FFmpeg installed?`, {
          cause: err,
        }),
      );
    });
    child.on('close', (code) => {
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolvePromise({ stdout, stderr });
      else {
        reject(
          new AppError('media_failed', `${bin} exited with code ${code}: ${lastFfmpegError(stderr)}`, {
            details: { code, stderr: stderr.slice(-4000) },
            retryable: true,
          }),
        );
      }
    });
  });
}

function lastFfmpegError(stderr: string): string {
  const lines = stderr.trim().split('\n').filter(Boolean);
  return lines.slice(-3).join(' | ').slice(0, 500);
}

export interface ProbeStream {
  index: number;
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  r_frame_rate?: string;
  sample_rate?: string;
  channels?: number;
  bit_rate?: string;
}

export interface ProbeResult {
  format: {
    filename?: string;
    duration?: string;
    size?: string;
    bit_rate?: string;
    format_name?: string;
  };
  streams: ProbeStream[];
}

export interface MediaInfo {
  durationSec: number;
  sizeBytes: number;
  hasVideo: boolean;
  hasAudio: boolean;
  width?: number;
  height?: number;
  fps?: number;
  videoCodec?: string;
  audioCodec?: string;
  audioChannels?: number;
  audioSampleRate?: number;
}

export class MediaTools {
  constructor(
    private readonly ffmpegPath = 'ffmpeg',
    private readonly ffprobePath = 'ffprobe',
  ) {}

  async available(): Promise<boolean> {
    try {
      await runBinary(this.ffmpegPath, ['-version'], { timeoutMs: 10_000 });
      return true;
    } catch {
      return false;
    }
  }

  async run(args: string[], opts?: RunOptions): Promise<FfmpegResult> {
    return runBinary(this.ffmpegPath, ['-hide_banner', '-nostdin', '-y', ...args], opts);
  }

  async probe(filePath: string): Promise<MediaInfo> {
    const { stdout } = await runBinary(
      this.ffprobePath,
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath],
      { timeoutMs: 60_000 },
    );
    const parsed = JSON.parse(stdout) as ProbeResult;
    const video = parsed.streams.find((s) => s.codec_type === 'video');
    const audio = parsed.streams.find((s) => s.codec_type === 'audio');
    return {
      durationSec: Number(parsed.format.duration ?? video?.duration ?? audio?.duration ?? 0),
      sizeBytes: Number(parsed.format.size ?? 0),
      hasVideo: Boolean(video),
      hasAudio: Boolean(audio),
      width: video?.width,
      height: video?.height,
      fps: video?.r_frame_rate ? parseFraction(video.r_frame_rate) : undefined,
      videoCodec: video?.codec_name,
      audioCodec: audio?.codec_name,
      audioChannels: audio?.channels,
      audioSampleRate: audio?.sample_rate ? Number(audio.sample_rate) : undefined,
    };
  }

  /**
   * Detects fully black frames (spec §26). Uses the `blackdetect` filter and parses its
   * report lines out of stderr.
   */
  async detectBlackFrames(filePath: string, minDurationSec = 0.5): Promise<Array<{ start: number; end: number }>> {
    const { stderr } = await this.run([
      '-i',
      filePath,
      '-vf',
      `blackdetect=d=${minDurationSec}:pic_th=0.98:pix_th=0.10`,
      '-an',
      '-f',
      'null',
      '-',
    ]);
    const out: Array<{ start: number; end: number }> = [];
    for (const match of stderr.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)) {
      out.push({ start: Number(match[1]), end: Number(match[2]) });
    }
    return out;
  }

  /** Detects long silences in the mixed audio (spec §26). */
  async detectSilence(filePath: string, thresholdDb = -50, minDurationSec = 3): Promise<Array<{ start: number; end: number }>> {
    const { stderr } = await this.run([
      '-i',
      filePath,
      '-af',
      `silencedetect=noise=${thresholdDb}dB:d=${minDurationSec}`,
      '-vn',
      '-f',
      'null',
      '-',
    ]);
    const out: Array<{ start: number; end: number }> = [];
    let pendingStart: number | null = null;
    for (const line of stderr.split('\n')) {
      const start = /silence_start: (-?[\d.]+)/.exec(line);
      if (start) pendingStart = Number(start[1]);
      const end = /silence_end: ([\d.]+)/.exec(line);
      if (end && pendingStart !== null) {
        out.push({ start: pendingStart, end: Number(end[1]) });
        pendingStart = null;
      }
    }
    return out;
  }

  /** Integrated loudness in LUFS, used to verify the audio mix (spec §25). */
  async measureLoudness(filePath: string): Promise<{ integratedLufs: number; truePeakDb: number } | null> {
    const { stderr } = await this.run([
      '-i',
      filePath,
      '-af',
      'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
      '-f',
      'null',
      '-',
    ]);
    const start = stderr.lastIndexOf('{');
    const end = stderr.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    try {
      const parsed = JSON.parse(stderr.slice(start, end + 1)) as {
        input_i?: string;
        input_tp?: string;
      };
      return {
        integratedLufs: Number(parsed.input_i ?? 0),
        truePeakDb: Number(parsed.input_tp ?? 0),
      };
    } catch {
      return null;
    }
  }

  /** Grabs a single frame — used for thumbnails and for QC frame inspection. */
  async extractFrame(filePath: string, atSec: number, outPath: string): Promise<string> {
    await this.run(['-ss', String(atSec), '-i', filePath, '-frames:v', '1', '-q:v', '2', outPath]);
    return outPath;
  }

  /** Transcodes any input into the normalised intermediate the timeline compiler expects. */
  async normalizeAudio(inputPath: string, outPath: string, sampleRate = 48_000): Promise<string> {
    await this.run(['-i', inputPath, '-ac', '2', '-ar', String(sampleRate), '-c:a', 'pcm_s16le', outPath]);
    return outPath;
  }
}

function parseFraction(value: string): number {
  const [num, den] = value.split('/').map(Number);
  if (!den) return num ?? 0;
  return Math.round(((num ?? 0) / den) * 100) / 100;
}

/** A scratch directory for one render; the caller is responsible for cleaning it up. */
export async function createWorkDir(base: string, prefix = 'render'): Promise<string> {
  const root = resolve(base);
  await mkdir(root, { recursive: true });
  return mkdtemp(join(root, `${prefix}-`));
}

export async function systemTempDir(prefix = 'ycf-'): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

/** Escapes a string for use inside an ffmpeg filter argument (drawtext, subtitles…). */
export function escapeFilterText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\u2019")
    .replace(/%/g, '\\%')
    .replace(/\n/g, ' ');
}

/** Escapes a path for the `subtitles=` / `ass=` filter, where colons must survive on Windows. */
export function escapeFilterPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}
