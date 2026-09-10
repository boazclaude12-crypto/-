import { createHash } from 'node:crypto';
import type { AppConfig } from '../../config/index.js';
import { MediaTools, systemTempDir } from '../../media/ffmpeg.js';
import { join } from 'node:path';
import { readFile, rm } from 'node:fs/promises';
import type { Capability } from '../../shared/types.js';
import { usd } from '../../shared/types.js';
import { ProviderError } from '../../shared/errors.js';
import type {
  AIProvider,
  EstimateInput,
  ImageCapable,
  ImageRequest,
  ImageResponse,
  MusicCapable,
  MusicRequest,
  MusicResponse,
  OAuthTokens,
  ProviderHealth,
  PublishingProvider,
  RemoteChannel,
  RemoteVideo,
  StructuredCapable,
  StructuredRequest,
  StructuredResponse,
  TextCapable,
  TextRequest,
  TextResponse,
  UploadRequest,
  UploadResult,
  VideoCapable,
  VideoMetrics,
  VideoRequest,
  VideoResponse,
  VoiceCapable,
  VoiceRequest,
  VoiceResponse,
  WordTiming,
} from '../types.js';

/**
 * Mock providers (spec §73). They are deterministic — the same request always produces the
 * same output — so the pipeline can be exercised end to end in CI without spending a cent
 * and without any network access. Structured output is *generated from the JSON Schema*
 * rather than hard-coded, which means the mocks stay valid as agent contracts evolve.
 */

function seedOf(...parts: string[]): number {
  const hash = createHash('sha256').update(parts.join('|')).digest();
  return hash.readUInt32BE(0);
}

/** Deterministic PRNG so runs are reproducible. */
export class Rng {
  private state: number;
  constructor(seed: number) {
    this.state = seed || 1;
  }
  next(): number {
    // xorshift32
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0xffffffff;
  }
  int(min: number, max: number): number {
    return Math.floor(min + this.next() * (max - min + 1));
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)] ?? items[0]!;
  }
}

interface JsonSchemaNode {
  type?: string | string[];
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  description?: string;
}

export interface SynthesisContext {
  topic: string;
  audience: string;
  key?: string;
  /** Index of the enclosing array item, so sibling items differ from one another. */
  variant?: number;
  /** Requested collection size, read out of the prompt when it states one. */
  count?: number;
}

/**
 * Builds a value that satisfies a JSON Schema. Field names steer the content so mock
 * scripts, ideas and SEO metadata read like plausible copy rather than "string".
 *
 * Mocks deliberately return a *healthy* result — verdicts pass, confidences are high,
 * scores land in a plausible-good band. That is what makes them useful: the happy path
 * runs end to end without spending anything. Tests that need a failure inject one
 * explicitly (`MockLLMProvider.failNextCalls`) rather than waiting for the dice.
 */
export function synthesizeFromSchema(
  schema: JsonSchemaNode,
  rng: Rng,
  context: SynthesisContext,
  depth = 0,
): unknown {
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  const key = (context.key ?? '').toLowerCase();

  if (schema.enum?.length) return pickEnum(schema.enum, key, rng);

  switch (type) {
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const [childKey, child] of Object.entries(schema.properties ?? {})) {
        out[childKey] = synthesizeFromSchema(child, rng, { ...context, key: childKey }, depth + 1);
      }
      return out;
    }
    case 'array': {
      const min = schema.minItems ?? 2;
      const max = schema.maxItems ?? min + 3;
      const requested = context.count ?? rng.int(min, Math.min(max, min + 3));
      const count = Math.max(min, Math.min(max, Math.max(1, requested)));
      return Array.from({ length: count }, (_, i) =>
        synthesizeFromSchema(schema.items ?? {}, rng, { ...context, variant: i, key: context.key }, depth + 1),
      );
    }
    case 'integer':
    case 'number': {
      const min = schema.minimum ?? 0;
      const max = schema.maximum ?? (min <= 1 ? 1 : 100);
      const value = numberFor(key, min, max, rng);
      return type === 'integer' ? Math.round(value) : Math.round(value * 100) / 100;
    }
    case 'boolean':
      // `passed` and `ok` gate the pipeline; a mock that randomly fails QC is useless.
      return key.includes('pass') || key === 'ok' ? true : rng.next() > 0.25;
    case 'null':
      return null;
    default:
      return mockString(context.key ?? 'text', context.topic, context.audience, rng, schema, context.variant ?? 0);
  }
}

/** Enum choice biased towards the healthy value where one exists. */
function pickEnum(values: unknown[], key: string, rng: Rng): unknown {
  const preferred: Record<string, string> = {
    verdict: 'SUPPORTED',
    severity: 'info',
    strategy: 'IMAGE_MOTION',
    type: 'cut',
  };
  const wanted = preferred[key];
  if (wanted && values.includes(wanted)) return wanted;
  return rng.pick(values);
}

/** Fields where a LOW value is the healthy one. */
const INVERTED_SCORES = new Set(['competition', 'productioncostusd', 'costusd']);

/**
 * Any 0-1 or 0-100 field is treated as a score and lands in a healthy band, so the mock
 * run clears the default channel thresholds deterministically. Inverted metrics (where low
 * is good, like competition) land at the other end.
 */
function numberFor(key: string, min: number, max: number, rng: Rng): number {
  const looksLikeScore =
    /score|potential|strength|priority|confidence|percentage|demand|retention|novelty|evergreen|ctr|importance|weight/.test(
      key,
    ) ||
    (min === 0 && (max === 100 || max === 1));
  if (!looksLikeScore) return min + rng.next() * (max - min);

  const span = max - min;
  const [lo, hi] = INVERTED_SCORES.has(key)
    ? [min + span * 0.15, min + span * 0.45]
    : [min + span * 0.72, min + span * 0.95];
  return lo + rng.next() * (hi - lo);
}

const HOOKS = [
  'Everything you were taught about this is a simplification — and the real story is stranger.',
  'In under ten minutes you will see why this one decision reshaped an entire century.',
  'There is a detail hiding in the record that almost nobody mentions.',
  'The official account and the surviving evidence disagree, and the gap is the story.',
  'One number in the archive changes how the whole period reads.',
];

const TAG_QUALIFIERS = [
  'documentary',
  'explained',
  'timeline',
  'analysis',
  'facts',
  'origins',
  'full story',
  'breakdown',
];

const SHOTS = [
  'Cinematic wide establishing shot',
  'Slow push-in on a single subject',
  'Overhead detail shot',
  'Low-angle silhouette against sky',
  'Close-up on hands and an object',
  'Static two-shot in a doorway',
];

/** Distinct angles so sibling array items are not copies of one another. */
const ANGLES = [
  'What Actually Happened',
  'The Part Everyone Skips',
  'Why It Went Wrong',
  'The Evidence Nobody Cites',
  'How It Was Really Decided',
  'The Cost Nobody Counted',
];

function mockString(
  key: string,
  topic: string,
  audience: string,
  rng: Rng,
  schema: JsonSchemaNode,
  variant = 0,
): string {
  const k = key.toLowerCase();
  const angleWords = ANGLES[variant % ANGLES.length]!;
  let value: string;
  if (k.includes('url')) value = `https://example.org/sources/${slug(topic)}-${rng.int(100, 999)}`;
  else if (k === 'hook' || k.includes('hook')) value = HOOKS[variant % HOOKS.length]!;
  else if (k.includes('title')) value = `${capitalize(topic)}: ${angleWords}`;
  else if (k.includes('heading')) value = `${capitalize(topic)} — ${angleWords.toLowerCase()}`;
  else if (k.includes('topic')) value = variant === 0 ? topic : `${topic} — ${angleWords.toLowerCase()}`;
  else if (k.includes('audience')) value = audience;
  else if (k.includes('angle')) value = `A grounded, source-led look at ${topic}.`;
  else if (k.includes('claim')) value = `Records indicate a measurable shift in ${topic} over the period studied.`;
  else if (k.includes('source')) value = `Reference work on ${topic}`;
  else if (k.includes('narration') || k.includes('description') || k.includes('summary'))
    value = paragraph(topic, audience, rng);
  else if (k.includes('negativeprompt')) value = 'text artefacts, watermarks, distorted hands';
  else if (k.includes('prompt'))
    value = `${SHOTS[variant % SHOTS.length]} illustrating ${topic} — ${angleWords.toLowerCase()}, natural light, shallow depth of field`;
  else if (k.includes('reason') || k.includes('note') || k.includes('detail') || k.includes('observation'))
    value = `Chosen because it matches the channel's audience (${audience}) and the available research on ${topic}.`;
  else if (k.includes('cta')) value = 'If this was useful, subscribe — the next one goes deeper.';
  else if (k.includes('variant')) value = rng.pick(['A', 'B', 'C']);
  else if (k.includes('camera')) value = rng.pick(['slow push in', 'static wide', 'gentle pan right']);
  else if (k.includes('motion')) value = rng.pick(['subtle parallax', 'slow zoom', 'drifting clouds']);
  else if (k.includes('style')) value = 'documentary, muted colour grade';
  else if (k.includes('hashtag')) value = `#${slug(topic).replace(/-/g, '').slice(0, 20)}`;
  else if (k.includes('tag') || k.includes('keyword'))
    value = `${TAG_QUALIFIERS[variant % TAG_QUALIFIERS.length]} ${shortTopic(topic)}`;
  else value = `${capitalize(topic)} — ${angleWords}`;

  if (schema.maxLength && value.length > schema.maxLength) value = value.slice(0, schema.maxLength);
  if (schema.minLength && value.length < schema.minLength) {
    value = value.padEnd(schema.minLength, ' ').slice(0, Math.max(schema.minLength, value.length));
  }
  return value;
}

function paragraph(topic: string, audience: string, rng: Rng): string {
  const sentences = [
    `${capitalize(topic)} is easier to understand once you separate the claim from the evidence.`,
    `The sources agree on the outline and disagree on the timing, which is where this gets interesting.`,
    `For ${audience}, the practical consequence is the part worth remembering.`,
    `Hold on to that number, because it changes what the next section means.`,
    `That single detail is what most summaries leave out.`,
  ];
  const count = rng.int(3, 5);
  return Array.from({ length: count }, (_, i) => sentences[(i + rng.int(0, 4)) % sentences.length]).join(' ');
}

/** First few words of the topic — long slugs collide once maxLength truncates them. */
function shortTopic(topic: string): string {
  return topic.split(/\s+/).slice(0, 3).join(' ').replace(/[^\p{L}\p{N} ]/gu, '').toLowerCase();
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'topic';
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ── mock LLM ─────────────────────────────────────────────────────────────────

export class MockLLMProvider implements AIProvider, TextCapable, StructuredCapable {
  readonly key = 'mock-llm';
  readonly name = 'Mock language model';
  readonly capabilities: readonly Capability[] = [
    'generateText',
    'generateStructuredOutput',
    'analyzeText',
    'research',
  ];
  /** Set by tests to make the next call fail, exercising retry and fallback paths. */
  failNextCalls = 0;

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
    return { ok: true, latencyMs: 0, detail: 'mock' };
  }

  private maybeFail(): void {
    if (this.failNextCalls > 0) {
      this.failNextCalls -= 1;
      throw new ProviderError(this.key, 'Injected mock failure', { retryable: true });
    }
  }

  async generateText(req: TextRequest): Promise<TextResponse> {
    this.maybeFail();
    const rng = new Rng(seedOf(req.system, req.prompt));
    const text = paragraph(extractTopic(req.prompt), 'a general audience', rng);
    return {
      text,
      usage: {
        inputUnits: Math.ceil((req.system.length + req.prompt.length) / 4),
        outputUnits: Math.ceil(text.length / 4),
        unit: 'token',
        model: 'mock-text',
        cost: usd(0),
      },
    };
  }

  async generateStructuredOutput<T = unknown>(req: StructuredRequest): Promise<StructuredResponse<T>> {
    this.maybeFail();
    const rng = new Rng(seedOf(req.schemaName, req.prompt));
    const topic = extractTopic(req.prompt);
    const audience = extractAudience(req.prompt);
    const count = extractCount(req.prompt);
    const data = synthesizeFromSchema(req.schema as JsonSchemaNode, rng, { topic, audience, count }) as T;
    const raw = JSON.stringify(data);
    return {
      data,
      raw,
      usage: {
        inputUnits: Math.ceil(req.prompt.length / 4),
        outputUnits: Math.ceil(raw.length / 4),
        unit: 'token',
        model: 'mock-structured',
        cost: usd(0),
      },
    };
  }
}

function extractTopic(prompt: string): string {
  const m = /(?:^|\n)\s*(?:Topic|topic|Niche|niche|Working title)\s*[:=]\s*(.+)/.exec(prompt);
  return (m?.[1] ?? 'the subject').trim().slice(0, 80);
}

/** "Number of ideas to produce: 5" / "Produce exactly 5" → 5. */
function extractCount(prompt: string): number | undefined {
  const m = /(?:Number of \w+ to produce|Produce exactly|approximately)\s*:?\s*(\d+)/.exec(prompt);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 && n <= 50 ? n : undefined;
}

function extractAudience(prompt: string): string {
  const m = /(?:^|\n)\s*(?:audience|targetAudience|Audience)\s*[:=]\s*(.+)/.exec(prompt);
  return (m?.[1] ?? 'curious general viewers').trim().slice(0, 80);
}

// ── mock media ───────────────────────────────────────────────────────────────

/**
 * Produces genuinely decodable media with FFmpeg rather than random bytes — the QC stage
 * probes these files, so a fake buffer would make the offline run meaningless.
 */
export class MockMediaProvider implements AIProvider, ImageCapable, VideoCapable, MusicCapable {
  readonly key = 'mock-media';
  readonly name = 'Mock image, video and music';
  readonly capabilities: readonly Capability[] = ['generateImage', 'generateVideo', 'generateMusic'];
  private readonly media: MediaTools;

  constructor(config: AppConfig) {
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
    return { ok: await this.media.available(), detail: 'mock' };
  }

  async generateImage(req: ImageRequest): Promise<ImageResponse> {
    const dir = await systemTempDir('mockimg-');
    const out = join(dir, 'image.png');
    const rng = new Rng(seedOf(req.prompt));
    try {
      await this.media.run([
        '-f',
        'lavfi',
        '-i',
        `testsrc2=size=${req.width}x${req.height}:rate=1:duration=1`,
        '-vf',
        `hue=h=${rng.int(0, 359)}`,
        '-frames:v',
        '1',
        out,
      ]);
      return {
        images: [{ bytes: await readFile(out), mimeType: 'image/png', width: req.width, height: req.height }],
        usage: { inputUnits: 0, outputUnits: 1, unit: 'image', model: 'mock-image', cost: usd(0) },
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async generateVideo(req: VideoRequest): Promise<VideoResponse> {
    const dir = await systemTempDir('mockvid-');
    const out = join(dir, 'clip.mp4');
    const rng = new Rng(seedOf(req.prompt));
    try {
      await this.media.run([
        '-f',
        'lavfi',
        '-i',
        `testsrc2=size=1280x720:rate=30:duration=${req.durationSec}`,
        '-vf',
        `hue=h=${rng.int(0, 359)},format=yuv420p`,
        '-t',
        String(req.durationSec),
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-an',
        out,
      ]);
      return {
        video: {
          bytes: await readFile(out),
          mimeType: 'video/mp4',
          durationSec: req.durationSec,
          width: 1280,
          height: 720,
        },
        usage: { inputUnits: 0, outputUnits: req.durationSec, unit: 'second', model: 'mock-video', cost: usd(0) },
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async generateMusic(req: MusicRequest): Promise<MusicResponse> {
    const dir = await systemTempDir('mockmus-');
    const out = join(dir, 'bed.m4a');
    try {
      await this.media.run([
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=196:duration=${Math.ceil(req.durationSec)}:sample_rate=48000`,
        '-af',
        'volume=-24dB',
        '-t',
        String(req.durationSec),
        '-c:a',
        'aac',
        out,
      ]);
      return {
        audio: { bytes: await readFile(out), mimeType: 'audio/mp4', durationSec: req.durationSec },
        title: `Mock ${req.mood} bed`,
        license: 'owned',
        usage: { inputUnits: 0, outputUnits: req.durationSec, unit: 'second', model: 'mock-music', cost: usd(0) },
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

/**
 * Mock TTS. Synthesises a real audio file whose length matches the narration at a realistic
 * speaking rate, and derives word timings from it — so subtitle generation and timeline
 * alignment are exercised for real.
 */
export class MockVoiceProvider implements AIProvider, VoiceCapable {
  readonly key = 'mock-voice';
  readonly name = 'Mock text-to-speech';
  readonly capabilities: readonly Capability[] = ['generateVoice'];
  private readonly media: MediaTools;

  constructor(config: AppConfig) {
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
    return { ok: await this.media.available(), detail: 'mock' };
  }

  async listVoices() {
    return [
      { id: 'mock-narrator', name: 'Mock Narrator' },
      { id: 'mock-warm', name: 'Mock Warm' },
    ];
  }

  async generateVoice(req: VoiceRequest): Promise<VoiceResponse> {
    const words = req.text.trim().split(/\s+/).filter(Boolean);
    const wordsPerSecond = 145 / 60;
    const durationSec = Math.max(0.6, words.length / wordsPerSecond);

    const dir = await systemTempDir('mocktts-');
    const out = join(dir, 'vo.m4a');
    try {
      await this.media.run([
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=180:duration=${durationSec.toFixed(3)}:sample_rate=44100`,
        '-af',
        // A gentle warble reads as "speech-shaped" to loudness analysis without being noise.
        'tremolo=f=5:d=0.7,volume=-12dB',
        '-t',
        durationSec.toFixed(3),
        '-c:a',
        'aac',
        out,
      ]);

      const perWord = durationSec / Math.max(1, words.length);
      const wordTimings: WordTiming[] = words.map((word, i) => ({
        word,
        start: Math.round(i * perWord * 1000) / 1000,
        end: Math.round((i + 1) * perWord * 1000) / 1000,
      }));

      return {
        audio: await readFile(out),
        mimeType: 'audio/mp4',
        durationSec,
        wordTimings,
        usage: {
          inputUnits: req.text.length,
          outputUnits: durationSec,
          unit: 'character',
          model: 'mock-tts',
          cost: usd(0),
        },
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

/** Mock publishing target — records what would have been uploaded. */
export class MockYouTubeProvider implements PublishingProvider {
  readonly key = 'youtube';
  readonly name = 'Mock YouTube';
  readonly capabilities: readonly Capability[] = ['publish'];
  readonly uploaded: UploadRequest[] = [];
  readonly thumbnails: Array<{ videoId: string; bytes: number }> = [];

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
    return { ok: true, detail: 'mock' };
  }

  authorizeUrl(state: string): string {
    return `https://mock.local/oauth?state=${encodeURIComponent(state)}`;
  }

  async exchangeCode(code: string): Promise<OAuthTokens> {
    return {
      accessToken: `mock-access-${code}`,
      refreshToken: `mock-refresh-${code}`,
      expiresAt: new Date(Date.now() + 3600_000),
      scope: 'mock',
      tokenType: 'Bearer',
    };
  }

  async refresh(refreshToken: string): Promise<OAuthTokens> {
    return {
      accessToken: `mock-access-${Date.now()}`,
      refreshToken,
      expiresAt: new Date(Date.now() + 3600_000),
      scope: 'mock',
      tokenType: 'Bearer',
    };
  }

  async revoke(): Promise<void> {}

  async getChannel(): Promise<RemoteChannel> {
    return {
      id: 'UCmock000000000000000000',
      title: 'Mock Channel',
      description: 'A channel that exists only in tests.',
      subscriberCount: 12_400,
      videoCount: 42,
      viewCount: 1_240_000,
    };
  }

  async listChannelVideos(_token: string, channelId: string, limit = 10): Promise<RemoteVideo[]> {
    return this.listPublicVideos(channelId, limit);
  }

  async lookupPublicChannel(channelId: string): Promise<RemoteChannel> {
    const rng = new Rng(seedOf(channelId));
    return {
      id: channelId,
      title: `Competitor ${channelId.slice(-4)}`,
      subscriberCount: rng.int(5_000, 900_000),
      videoCount: rng.int(50, 600),
      viewCount: rng.int(500_000, 90_000_000),
    };
  }

  async listPublicVideos(channelId: string, limit = 10): Promise<RemoteVideo[]> {
    const rng = new Rng(seedOf(channelId, 'videos'));
    const topics = ['the forgotten treaty', 'a machine that changed everything', 'the map that was wrong'];
    return Array.from({ length: Math.min(limit, 10) }, (_, i) => ({
      id: `mockvid${i}${channelId.slice(-3)}`,
      title: `${capitalize(rng.pick(topics))} (${rng.int(1, 12)})`,
      publishedAt: new Date(Date.now() - i * 3 * 86_400_000).toISOString(),
      durationSec: rng.int(420, 1_500),
      views: rng.int(1_000, 800_000),
      likes: rng.int(50, 30_000),
      comments: rng.int(5, 3_000),
    }));
  }

  async searchTopics(query: string, limit = 10): Promise<RemoteVideo[]> {
    return this.listPublicVideos(`search-${query}`, limit);
  }

  async upload(_token: string, req: UploadRequest): Promise<UploadResult> {
    this.uploaded.push(req);
    req.onProgress?.(1, 1);
    return {
      videoId: `mockyt${seedOf(req.title).toString(36).slice(0, 8)}`,
      uploadStatus: 'uploaded',
      privacyStatus: req.privacyStatus,
    };
  }

  async setThumbnail(_token: string, videoId: string, image: Buffer): Promise<void> {
    this.thumbnails.push({ videoId, bytes: image.length });
  }

  async updateMetadata(): Promise<void> {}

  async getMetrics(_token: string, _channelId: string, videoId: string): Promise<VideoMetrics> {
    const rng = new Rng(seedOf(videoId, 'metrics'));
    const views = rng.int(500, 25_000);
    const impressions = views * rng.int(8, 20);
    return {
      views,
      watchTimeMinutes: Math.round(views * (rng.next() * 4 + 2)),
      averageViewDuration: rng.int(120, 480),
      averageViewPercentage: rng.int(28, 62),
      impressions,
      ctr: Math.round((views / impressions) * 10_000) / 100,
      likes: Math.round(views * 0.04),
      comments: Math.round(views * 0.004),
      shares: Math.round(views * 0.002),
      subscribersGained: Math.round(views * 0.01),
    };
  }
}
