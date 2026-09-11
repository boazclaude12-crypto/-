import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { loadConfig, type AppConfig } from '../config/index.js';
import { AnthropicProvider } from '../providers/adapters/anthropic.js';
import { OpenAIProvider } from '../providers/adapters/openai.js';
import { HiggsfieldProvider } from '../providers/adapters/higgsfield.js';
import { ElevenLabsProvider } from '../providers/adapters/elevenlabs.js';
import { YouTubeProvider } from '../providers/adapters/youtube.js';
import { ProviderError, ProviderNotConfiguredError } from '../shared/errors.js';
import { FixedClock } from '../shared/clock.js';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Vendor contract tests.
 *
 * These assert the exact bytes each adapter puts on the wire — URL, method, headers, body
 * field names — and that it parses the vendor's documented response shape. A fake server
 * stands in for the vendor, so a wrong header name or a renamed field is caught here rather
 * than after a real key is added and credits are spent.
 *
 * The recorded request/response shapes come from each vendor's published API definition; see
 * the header comment of the adapter under test for the source.
 */

interface Captured {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
  raw: string;
}

class FakeVendor {
  private server!: Server;
  readonly requests: Captured[] = [];
  private handlers: Array<(req: Captured) => { status: number; body: unknown; headers?: Record<string, string> } | null> = [];

  async start(): Promise<string> {
    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        const captured: Captured = {
          method: req.method ?? 'GET',
          path: req.url ?? '/',
          headers: Object.fromEntries(
            Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : String(v ?? '')]),
          ),
          body: raw && raw.startsWith('{') ? JSON.parse(raw) : raw,
          raw,
        };
        this.requests.push(captured);

        for (const handler of this.handlers) {
          const result = handler(captured);
          if (result) {
            res.writeHead(result.status, { 'content-type': 'application/json', ...(result.headers ?? {}) });
            res.end(typeof result.body === 'string' ? result.body : JSON.stringify(result.body));
            return;
          }
        }
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: `no stub for ${captured.method} ${captured.path}` } }));
      });
    });

    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    const { port } = this.server.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  on(
    match: (req: Captured) => boolean,
    respond: (req: Captured) => { status: number; body: unknown; headers?: Record<string, string> },
  ): this {
    this.handlers.push((req) => (match(req) ? respond(req) : null));
    return this;
  }

  last(): Captured {
    const request = this.requests[this.requests.length - 1];
    if (!request) throw new Error('no request was made');
    return request;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}

let vendor: FakeVendor;
let baseUrl: string;

beforeEach(async () => {
  vendor = new FakeVendor();
  baseUrl = await vendor.start();
});
afterEach(async () => {
  await vendor.stop();
});

function config(overrides: Record<string, string>): AppConfig {
  return loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    ENCRYPTION_KEY: '0'.repeat(64),
    PROVIDER_TIMEOUT_MS: '5000',
    ...overrides,
  } as NodeJS.ProcessEnv);
}

// ── Anthropic ────────────────────────────────────────────────────────────────

describe('Anthropic adapter', () => {
  const setup = () =>
    new AnthropicProvider(
      config({ CLAUDE_API_KEY: 'sk-ant-test', ANTHROPIC_BASE_URL: baseUrl, ANTHROPIC_MODEL: 'claude-sonnet-4-5', ANTHROPIC_FAST_MODEL: 'claude-haiku-4-5' }),
    );

  it('sends the documented headers and message body', async () => {
    vendor.on(
      (r) => r.path === '/v1/messages',
      () => ({
        status: 200,
        body: {
          id: 'msg_1', model: 'claude-sonnet-4-5', stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'Hello from the model.' }],
          usage: { input_tokens: 120, output_tokens: 45 },
        },
      }),
    );

    const result = await setup().generateText({ system: 'You are a writer.', prompt: 'Write a line.', maxTokens: 500, temperature: 0.5 });

    const request = vendor.last();
    expect(request.method).toBe('POST');
    expect(request.path).toBe('/v1/messages');
    // These three header names are the contract. Getting any of them wrong is a 401.
    expect(request.headers['x-api-key']).toBe('sk-ant-test');
    expect(request.headers['anthropic-version']).toBe('2023-06-01');
    expect(request.headers['content-type']).toContain('application/json');
    expect(request.headers.authorization).toBeUndefined();

    expect(request.body).toMatchObject({
      model: 'claude-sonnet-4-5',
      max_tokens: 500,
      temperature: 0.5,
      system: 'You are a writer.',
      messages: [{ role: 'user', content: 'Write a line.' }],
    });

    expect(result.text).toBe('Hello from the model.');
    expect(result.usage.inputUnits).toBe(120);
    expect(result.usage.outputUnits).toBe(45);
    expect(result.usage.cost.usd).toBeGreaterThan(0);
  });

  it('forces a single tool call for structured output and reads its input', async () => {
    vendor.on(
      (r) => r.path === '/v1/messages',
      (r) => {
        const body = r.body as { tools: Array<{ name: string; input_schema: unknown }>; tool_choice: unknown };
        return {
          status: 200,
          body: {
            id: 'msg_2', model: 'claude-sonnet-4-5', stop_reason: 'tool_use',
            content: [
              { type: 'text', text: 'ignored preamble' },
              { type: 'tool_use', id: 'tu_1', name: body.tools[0]!.name, input: { title: 'Parsed', score: 88 } },
            ],
            usage: { input_tokens: 200, output_tokens: 60 },
          },
        };
      },
    );

    const result = await setup().generateStructuredOutput<{ title: string; score: number }>({
      system: 'system', prompt: 'prompt',
      schema: { type: 'object', properties: { title: { type: 'string' }, score: { type: 'number' } }, required: ['title', 'score'] },
      schemaName: 'video script',
    });

    const body = vendor.last().body as { tools: Array<{ name: string; input_schema: unknown }>; tool_choice: { type: string; name: string } };
    // Tool names must match ^[a-zA-Z0-9_-]{1,64}$ — the space has to be sanitised away.
    expect(body.tools[0]!.name).toBe('video_script');
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'video_script' });
    expect(body.tools[0]!.input_schema).toMatchObject({ type: 'object' });

    expect(result.data).toEqual({ title: 'Parsed', score: 88 });
  });

  it('treats a missing tool call as retryable rather than returning nothing', async () => {
    vendor.on(
      (r) => r.path === '/v1/messages',
      () => ({
        status: 200,
        body: { id: 'm', model: 'm', stop_reason: 'max_tokens', content: [{ type: 'text', text: 'I cannot' }], usage: { input_tokens: 1, output_tokens: 1 } },
      }),
    );

    await expect(
      setup().generateStructuredOutput({ system: 's', prompt: 'p', schema: {}, schemaName: 'x' }),
    ).rejects.toMatchObject({ retryable: true });
  });

  it('surfaces the vendor error message and marks 429 retryable, 400 not', async () => {
    vendor.on((r) => r.path === '/v1/messages' && vendor.requests.length === 1, () => ({
      status: 429, body: { error: { type: 'rate_limit_error', message: 'Number of requests has exceeded your rate limit' } },
    }));
    vendor.on((r) => r.path === '/v1/messages', () => ({
      status: 400, body: { error: { type: 'invalid_request_error', message: 'max_tokens is too large' } },
    }));

    const provider = setup();
    await expect(provider.generateText({ system: 's', prompt: 'p' })).rejects.toMatchObject({
      retryable: true,
      message: expect.stringContaining('rate limit'),
    });
    await expect(provider.generateText({ system: 's', prompt: 'p' })).rejects.toMatchObject({
      retryable: false,
      message: expect.stringContaining('max_tokens'),
    });
  });

  it('reports itself unconfigured without a key, and never calls out', async () => {
    const provider = new AnthropicProvider(config({ ANTHROPIC_BASE_URL: baseUrl }));
    expect(provider.isConfigured()).toBe(false);
    expect(provider.missingConfig()[0]).toContain('CLAUDE_API_KEY');
    await expect(provider.generateText({ system: 's', prompt: 'p' })).rejects.toBeInstanceOf(ProviderNotConfiguredError);
    expect(vendor.requests).toHaveLength(0);
  });

  it('uses the fast model for draft quality', async () => {
    vendor.on((r) => r.path === '/v1/messages', () => ({
      status: 200,
      body: { id: 'm', model: 'claude-haiku-4-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 } },
    }));
    await setup().generateText({ system: 's', prompt: 'p', quality: 'draft' });
    expect((vendor.last().body as { model: string }).model).toBe('claude-haiku-4-5');
  });
});

// ── OpenAI ───────────────────────────────────────────────────────────────────

describe('OpenAI adapter', () => {
  const setup = () =>
    new OpenAIProvider(config({ OPENAI_API_KEY: 'sk-openai-test', OPENAI_BASE_URL: baseUrl, OPENAI_MODEL: 'gpt-4.1', OPENAI_IMAGE_MODEL: 'gpt-image-1' }));

  it('uses a bearer token and the strict json_schema response format', async () => {
    vendor.on((r) => r.path === '/v1/chat/completions', () => ({
      status: 200,
      body: {
        model: 'gpt-4.1',
        choices: [{ message: { content: '{"title":"From OpenAI","score":71}' } }],
        usage: { prompt_tokens: 300, completion_tokens: 90 },
      },
    }));

    const result = await setup().generateStructuredOutput<{ title: string }>({
      system: 's', prompt: 'p', schema: { type: 'object' }, schemaName: 'seo metadata',
    });

    const request = vendor.last();
    expect(request.headers.authorization).toBe('Bearer sk-openai-test');
    const body = request.body as { response_format: { type: string; json_schema: { name: string; strict: boolean } }; max_completion_tokens: number };
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.name).toBe('seo_metadata');
    expect(body.response_format.json_schema.strict).toBe(true);
    // The parameter is max_completion_tokens on this endpoint, not max_tokens.
    expect(body.max_completion_tokens).toBeGreaterThan(0);

    expect(result.data.title).toBe('From OpenAI');
    expect(result.usage.inputUnits).toBe(300);
  });

  it('rejects invalid JSON as retryable', async () => {
    vendor.on((r) => r.path === '/v1/chat/completions', () => ({
      status: 200, body: { choices: [{ message: { content: 'not json at all' } }], usage: {} },
    }));
    await expect(
      setup().generateStructuredOutput({ system: 's', prompt: 'p', schema: {}, schemaName: 'x' }),
    ).rejects.toMatchObject({ retryable: true, message: expect.stringContaining('invalid JSON') });
  });

  it('requests a supported image size for the aspect ratio and decodes base64', async () => {
    const png = Buffer.from('fake-png-bytes');
    vendor.on((r) => r.path === '/v1/images/generations', () => ({
      status: 200, body: { data: [{ b64_json: png.toString('base64') }] },
    }));

    const result = await setup().generateImage({
      prompt: 'a wide cinematic shot', negativePrompt: 'text, watermarks',
      width: 1920, height: 1080, quality: 'premium',
    });

    const body = vendor.last().body as { model: string; size: string; quality: string; prompt: string; n: number };
    expect(body.model).toBe('gpt-image-1');
    expect(body.size).toBe('1536x1024'); // landscape
    expect(body.quality).toBe('high');
    // There is no negative-prompt field on this endpoint, so exclusions go into the prompt.
    expect(body.prompt).toContain('Avoid: text, watermarks');

    expect(result.images[0]!.bytes?.toString()).toBe('fake-png-bytes');
  });
});

// ── Higgsfield ───────────────────────────────────────────────────────────────

describe('Higgsfield adapter', () => {
  const clock = new FixedClock();
  const setup = (extra: Record<string, string> = {}) =>
    new HiggsfieldProvider(
      config({ HF_CREDENTIALS: 'KEYID:KEYSECRET', HIGGSFIELD_BASE_URL: baseUrl, HIGGSFIELD_VIDEO_MODEL: 'dop-turbo', ...extra }),
      clock,
    );

  it('authenticates with the Key scheme and posts the soul text2image body', async () => {
    const png = Buffer.from('image-bytes');
    vendor
      .on((r) => r.path.startsWith('/v1/text2image/soul'), () => ({
        status: 200,
        body: { status: 'completed', request_id: 'req-1', images: [{ url: `${baseUrl}/download/img.png` }] },
      }))
      .on((r) => r.path === '/download/img.png', () => ({ status: 200, body: png.toString(), headers: { 'content-type': 'image/png' } }));

    const result = await setup().generateImage({
      prompt: 'a cathedral at dusk', negativePrompt: 'text artefacts',
      width: 1920, height: 1080, quality: 'standard', seed: 42,
    });

    const submit = vendor.requests[0]!;
    // `Authorization: Key KEY_ID:KEY_SECRET` — not Bearer, not x-api-key.
    expect(submit.headers.authorization).toBe('Key KEYID:KEYSECRET');
    expect(submit.path).toBe('/v1/text2image/soul');
    expect(submit.body).toMatchObject({
      width_and_height: '1536x864',
      quality: '1080p',
      batch_size: 1,
      enhance_prompt: true,
      seed: 42,
    });
    expect((submit.body as { prompt: string }).prompt).toContain('Avoid: text artefacts');

    expect(result.images[0]!.bytes?.toString()).toBe('image-bytes');
    expect(result.usage.cost.usd).toBeGreaterThan(0);
  });

  it('polls /requests/{id}/status until the job reaches a terminal state', async () => {
    let polls = 0;
    vendor
      .on((r) => r.path.startsWith('/v1/image2video/dop'), () => ({
        status: 200, body: { status: 'queued', request_id: 'req-9', status_url: '/requests/req-9/status' },
      }))
      .on((r) => r.path === '/requests/req-9/status', () => {
        polls += 1;
        return polls < 3
          ? { status: 200, body: { status: 'in_progress', request_id: 'req-9' } }
          : { status: 200, body: { status: 'completed', request_id: 'req-9', video: { url: `${baseUrl}/download/clip.mp4` } } };
      })
      .on((r) => r.path === '/download/clip.mp4', () => ({
        status: 200, body: 'video-bytes', headers: { 'content-type': 'video/mp4' },
      }));

    const result = await setup().generateVideo({
      prompt: 'slow push in', imageUrl: 'https://cdn.example/frame.png',
      durationSec: 6, aspectRatio: '16:9', motion: 'parallax', quality: 'standard',
    });

    expect(polls).toBe(3);
    const submit = vendor.requests[0]!;
    expect(submit.body).toMatchObject({
      model: 'dop-turbo',
      input_images: [{ type: 'image_url', image_url: 'https://cdn.example/frame.png' }],
      enhance_prompt: true,
    });
    expect(result.video.externalId).toBe('req-9');
    expect(result.video.bytes?.toString()).toBe('video-bytes');
    expect(result.usage.outputUnits).toBe(6);
  });

  it('appends the webhook as the hf_webhook query parameter', async () => {
    vendor.on((r) => r.path.startsWith('/v1/image2video/dop'), () => ({
      status: 200, body: { status: 'completed', request_id: 'r', video: { url: `${baseUrl}/d.mp4` } },
    })).on((r) => r.path === '/d.mp4', () => ({ status: 200, body: 'v', headers: { 'content-type': 'video/mp4' } }));

    await setup().generateVideo({
      prompt: 'p', imageUrl: 'https://cdn/x.png', durationSec: 5, aspectRatio: '16:9',
      webhookUrl: 'https://factory.example/api/webhooks/higgsfield?token=abc',
    });

    expect(vendor.requests[0]!.path).toContain('hf_webhook=');
    expect(decodeURIComponent(vendor.requests[0]!.path)).toContain('https://factory.example/api/webhooks/higgsfield?token=abc');
  });

  it('refuses text-to-video instead of inventing an endpoint', async () => {
    // The vendor exposes image2video and text2image; there is no text2video. Asking for
    // video without a first frame must fail loudly rather than call something that does
    // not exist.
    await expect(
      setup().generateVideo({ prompt: 'p', durationSec: 5, aspectRatio: '16:9' }),
    ).rejects.toMatchObject({ retryable: false, message: expect.stringContaining('image-to-video') });
    expect(vendor.requests).toHaveLength(0);
  });

  it('maps a failed job to retryable and an NSFW refusal to permanent', async () => {
    vendor.on((r) => r.path.startsWith('/v1/text2image/soul') && vendor.requests.length === 1, () => ({
      status: 200, body: { status: 'failed', request_id: 'r1' },
    }));
    vendor.on((r) => r.path.startsWith('/v1/text2image/soul'), () => ({
      status: 200, body: { status: 'nsfw', request_id: 'r2' },
    }));

    const provider = setup();
    await expect(provider.generateImage({ prompt: 'p', width: 1024, height: 1024 })).rejects.toMatchObject({ retryable: true });
    // Retrying the same prompt would be refused identically, so this is not retryable.
    await expect(provider.generateImage({ prompt: 'p', width: 1024, height: 1024 })).rejects.toMatchObject({ retryable: false });
  });

  it('reads the split credential pair as well as the combined form', () => {
    const split = new HiggsfieldProvider(config({ HF_API_KEY: 'id', HF_API_SECRET: 'secret', HIGGSFIELD_BASE_URL: baseUrl }), clock);
    expect(split.isConfigured()).toBe(true);

    const alias = new HiggsfieldProvider(config({ HIGGSFIELD_API_KEY: 'id', HIGGSFIELD_API_SECRET: 'secret', HIGGSFIELD_BASE_URL: baseUrl }), clock);
    expect(alias.isConfigured()).toBe(true);

    const none = new HiggsfieldProvider(config({ HIGGSFIELD_BASE_URL: baseUrl }), clock);
    expect(none.isConfigured()).toBe(false);
    expect(none.missingConfig()[0]).toContain('HF_CREDENTIALS');
  });

  it('maps 403 to a non-retryable out-of-credits error', async () => {
    vendor.on((r) => r.path.startsWith('/v1/text2image/soul'), () => ({
      status: 403, body: { detail: 'Not enough credits' },
    }));
    await expect(
      setup().generateImage({ prompt: 'p', width: 1024, height: 1024 }),
    ).rejects.toMatchObject({ retryable: false });
  });
});

// ── ElevenLabs ───────────────────────────────────────────────────────────────

describe('ElevenLabs adapter', () => {
  const setup = (extra: Record<string, string> = {}) =>
    new ElevenLabsProvider(
      config({ ELEVENLABS_API_KEY: 'xi-test', ELEVENLABS_BASE_URL: baseUrl, ELEVENLABS_MODEL: 'eleven_multilingual_v2', ...extra }),
    );

  it('calls with-timestamps with the xi-api-key header and snake_case settings', async () => {
    const audio = Buffer.from('mp3-bytes');
    vendor.on((r) => r.path.startsWith('/v1/text-to-speech/'), () => ({
      status: 200,
      body: {
        audio_base64: audio.toString('base64'),
        alignment: {
          characters: ['H', 'i', ' ', 'y', 'o', 'u'],
          character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5],
          character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.62],
        },
      },
    }));

    const result = await setup().generateVoice({
      text: 'Hi you', voiceId: 'voice-123', language: 'en',
      settings: { stability: 0.4, similarityBoost: 0.8, style: 0.1, speed: 1.05, useSpeakerBoost: false },
      previousText: 'before', nextText: 'after',
    });

    const request = vendor.last();
    expect(request.headers['xi-api-key']).toBe('xi-test');
    expect(request.headers.authorization).toBeUndefined();
    expect(request.path).toContain('/v1/text-to-speech/voice-123/with-timestamps');
    expect(request.path).toContain('output_format=mp3_44100_128');

    expect(request.body).toMatchObject({
      text: 'Hi you',
      model_id: 'eleven_multilingual_v2',
      language_code: 'en',
      previous_text: 'before',
      next_text: 'after',
      voice_settings: {
        stability: 0.4,
        similarity_boost: 0.8,
        style: 0.1,
        speed: 1.05,
        use_speaker_boost: false,
      },
    });

    expect(result.audio.toString()).toBe('mp3-bytes');
    expect(result.mimeType).toBe('audio/mpeg');
    // Character alignment must become word timings, or subtitles are unusable.
    expect(result.wordTimings).toEqual([
      { word: 'Hi', start: 0, end: 0.2 },
      { word: 'you', start: 0.3, end: 0.62 },
    ]);
    expect(result.durationSec).toBeCloseTo(0.62, 3);
  });

  it('falls back to the normalized alignment when the raw one is absent', async () => {
    vendor.on((r) => r.path.startsWith('/v1/text-to-speech/'), () => ({
      status: 200,
      body: {
        audio_base64: Buffer.from('a').toString('base64'),
        normalized_alignment: {
          characters: ['a', ' ', 'b'],
          character_start_times_seconds: [0, 0.5, 0.6],
          character_end_times_seconds: [0.5, 0.6, 1.0],
        },
      },
    }));
    const result = await setup().generateVoice({ text: 'a b', voiceId: 'v' });
    expect(result.wordTimings.map((w) => w.word)).toEqual(['a', 'b']);
  });

  it('refuses without a voice id rather than guessing one', async () => {
    await expect(setup().generateVoice({ text: 'x', voiceId: '' })).rejects.toMatchObject({
      retryable: false,
      message: expect.stringContaining('ELEVENLABS_DEFAULT_VOICE_ID'),
    });
    expect(vendor.requests).toHaveLength(0);
  });

  it('uses the configured default voice when the request omits one', async () => {
    vendor.on((r) => r.path.startsWith('/v1/text-to-speech/'), () => ({
      status: 200, body: { audio_base64: Buffer.from('a').toString('base64') },
    }));
    await setup({ ELEVENLABS_DEFAULT_VOICE_ID: 'default-voice' }).generateVoice({ text: 'x', voiceId: '' });
    expect(vendor.last().path).toContain('/v1/text-to-speech/default-voice/with-timestamps');
  });

  it('lists voices from the documented shape', async () => {
    vendor.on((r) => r.path === '/v1/voices', () => ({
      status: 200, body: { voices: [{ voice_id: 'v1', name: 'Rachel', labels: { accent: 'american' } }] },
    }));
    const voices = await setup().listVoices();
    expect(voices).toEqual([{ id: 'v1', name: 'Rachel', labels: { accent: 'american' } }]);
  });
});

// ── YouTube ──────────────────────────────────────────────────────────────────

describe('YouTube adapter', () => {
  const setup = () =>
    new YouTubeProvider(
      config({
        YOUTUBE_CLIENT_ID: 'client-id', YOUTUBE_CLIENT_SECRET: 'client-secret',
        YOUTUBE_REDIRECT_URI: 'http://localhost:4000/api/channels/oauth/callback',
        YOUTUBE_API_KEY: 'api-key',
      }),
      // Point every Google endpoint at the fake vendor so the real request-building logic
      // is exercised rather than mocked away.
      {
        oauthToken: `${baseUrl}/token`,
        oauthRevoke: `${baseUrl}/revoke`,
        api: `${baseUrl}/youtube/v3`,
        upload: `${baseUrl}/upload/youtube/v3`,
        analytics: `${baseUrl}/youtubeAnalytics/v2`,
      },
    );

  it('builds an authorize URL that actually yields a refresh token', () => {
    const url = new URL(setup().authorizeUrl('signed-state'));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('signed-state');
    // Without both of these Google returns no refresh token on a repeat authorisation.
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');

    const scopes = url.searchParams.get('scope')!.split(' ');
    expect(scopes).toContain('https://www.googleapis.com/auth/youtube.upload');
    expect(scopes).toContain('https://www.googleapis.com/auth/yt-analytics.readonly');
    // Least privilege: no full-account youtube scope.
    expect(scopes).not.toContain('https://www.googleapis.com/auth/youtube');
  });

  it('exchanges the code as form-encoded, not JSON', async () => {
    vendor.on((r) => r.path === '/token', () => ({
      status: 200,
      body: {
        access_token: 'ya29.access', refresh_token: '1//refresh', expires_in: 3599,
        scope: 'https://www.googleapis.com/auth/youtube.upload', token_type: 'Bearer',
      },
    }));

    const tokens = await setup().exchangeCode('auth-code-123');

    const request = vendor.last();
    // The token endpoint takes application/x-www-form-urlencoded; JSON gets a 400.
    expect(request.headers['content-type']).toContain('application/x-www-form-urlencoded');
    const form = new URLSearchParams(request.raw);
    expect(form.get('code')).toBe('auth-code-123');
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('client_id')).toBe('client-id');
    expect(form.get('client_secret')).toBe('client-secret');
    expect(form.get('redirect_uri')).toBe('http://localhost:4000/api/channels/oauth/callback');

    expect(tokens.accessToken).toBe('ya29.access');
    expect(tokens.refreshToken).toBe('1//refresh');
    expect(tokens.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('keeps the existing refresh token when the refresh response omits it', async () => {
    // Google returns refresh_token only on the first exchange. Dropping it here would
    // silently disconnect the channel the next time the access token expired.
    vendor.on((r) => r.path === '/token', () => ({
      status: 200, body: { access_token: 'ya29.new', expires_in: 3599, token_type: 'Bearer' },
    }));

    const tokens = await setup().refresh('1//original-refresh');

    const form = new URLSearchParams(vendor.last().raw);
    expect(form.get('grant_type')).toBe('refresh_token');
    expect(form.get('refresh_token')).toBe('1//original-refresh');

    expect(tokens.accessToken).toBe('ya29.new');
    expect(tokens.refreshToken).toBe('1//original-refresh');
  });

  it('reads the authorised channel with the mine flag and a bearer token', async () => {
    vendor.on((r) => r.path.startsWith('/youtube/v3/channels'), () => ({
      status: 200,
      body: {
        items: [{
          id: 'UCabcdefghijklmnopqrstuv',
          snippet: { title: 'My History Channel', description: 'desc', thumbnails: { high: { url: 'https://i/h.jpg' } } },
          statistics: { subscriberCount: '12400', videoCount: '42', viewCount: '9876543210' },
          contentDetails: { relatedPlaylists: { uploads: 'UUabc' } },
        }],
      },
    }));

    const channel = await setup().getChannel('ya29.access');

    const request = vendor.last();
    expect(request.headers.authorization).toBe('Bearer ya29.access');
    expect(request.path).toContain('mine=true');
    expect(request.path).toContain('part=snippet%2Cstatistics%2CcontentDetails');

    expect(channel).toMatchObject({
      id: 'UCabcdefghijklmnopqrstuv',
      title: 'My History Channel',
      subscriberCount: 12_400,
      // Counts arrive as strings and exceed 2^31 — they must survive as numbers.
      viewCount: 9_876_543_210,
      uploadsPlaylistId: 'UUabc',
    });
  });

  it('fails clearly when the authorised account has no channel', async () => {
    vendor.on((r) => r.path.startsWith('/youtube/v3/channels'), () => ({ status: 200, body: { items: [] } }));
    await expect(setup().getChannel('ya29')).rejects.toMatchObject({
      retryable: false,
      message: expect.stringContaining('no YouTube channel'),
    });
  });

  it('uploads with the documented resumable protocol', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'yt-upload-'));
    const file = join(dir, 'final.mp4');
    // Two chunks' worth would need 16 MiB; a small file proves the single-chunk path and
    // the Content-Range arithmetic without writing gigabytes in a test.
    const bytes = Buffer.alloc(3 * 1024 * 1024, 7);
    await writeFile(file, bytes);

    try {
      vendor
        .on((r) => r.method === 'POST' && r.path.startsWith('/upload/youtube/v3/videos'), () => ({
          status: 200, body: {}, headers: { location: `${baseUrl}/resumable-session-1` },
        }))
        .on((r) => r.method === 'PUT' && r.path === '/resumable-session-1', () => ({
          status: 200, body: { id: 'newvideoid1', status: { uploadStatus: 'uploaded', privacyStatus: 'private' } },
        }));

      const progress: Array<[number, number]> = [];
      const publishAt = new Date('2026-10-01T18:00:00.000Z');
      const result = await setup().upload('ya29.access', {
        filePath: file,
        title: 'A'.repeat(150), // over the limit on purpose
        description: 'The description.',
        tags: ['history', 'documentary'],
        categoryId: '27',
        privacyStatus: 'private',
        publishAt,
        language: 'en',
        madeForKids: false,
        onProgress: (uploaded, total) => progress.push([uploaded, total]),
      });

      const init = vendor.requests[0]!;
      expect(init.path).toContain('uploadType=resumable');
      expect(init.path).toContain('part=snippet%2Cstatus');
      expect(init.headers['x-upload-content-length']).toBe(String(bytes.length));
      expect(init.headers['x-upload-content-type']).toBe('video/mp4');

      const body = init.body as {
        snippet: { title: string; description: string; tags: string[]; categoryId: string; defaultLanguage: string };
        status: { privacyStatus: string; publishAt: string; selfDeclaredMadeForKids: boolean };
      };
      // YouTube rejects a title over 100 characters, so it is truncated before sending.
      expect(body.snippet.title).toHaveLength(100);
      expect(body.snippet.tags).toEqual(['history', 'documentary']);
      expect(body.snippet.categoryId).toBe('27');
      expect(body.snippet.defaultLanguage).toBe('en');
      expect(body.status.privacyStatus).toBe('private');
      expect(body.status.publishAt).toBe(publishAt.toISOString());
      expect(body.status.selfDeclaredMadeForKids).toBe(false);

      const put = vendor.requests[1]!;
      expect(put.method).toBe('PUT');
      expect(put.headers['content-range']).toBe(`bytes 0-${bytes.length - 1}/${bytes.length}`);
      expect(put.headers['content-length']).toBe(String(bytes.length));

      expect(result).toEqual({ videoId: 'newvideoid1', uploadStatus: 'uploaded', privacyStatus: 'private' });
      expect(progress[progress.length - 1]).toEqual([bytes.length, bytes.length]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('resumes from the byte the server reports after a 308', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'yt-resume-'));
    const file = join(dir, 'final.mp4');
    const bytes = Buffer.alloc(12 * 1024 * 1024, 3); // two 8 MiB chunks
    await writeFile(file, bytes);

    try {
      let puts = 0;
      vendor
        .on((r) => r.method === 'POST' && r.path.startsWith('/upload/youtube/v3/videos'), () => ({
          status: 200, body: {}, headers: { location: `${baseUrl}/session-2` },
        }))
        .on((r) => r.method === 'PUT' && r.path === '/session-2', () => {
          puts += 1;
          if (puts === 1) {
            // The server accepted fewer bytes than we sent; the next range must start there.
            return { status: 308, body: '', headers: { range: 'bytes=0-4194303' } };
          }
          return { status: 200, body: { id: 'resumed1', status: { uploadStatus: 'uploaded', privacyStatus: 'public' } } };
        });

      const result = await setup().upload('ya29', {
        filePath: file, title: 'T', description: 'D', tags: [], categoryId: '27', privacyStatus: 'public',
      });

      expect(puts).toBe(2);
      const second = vendor.requests[2]!;
      expect(second.headers['content-range']).toBe(`bytes 4194304-${bytes.length - 1}/${bytes.length}`);
      expect(result.videoId).toBe('resumed1');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('sets a thumbnail as raw media, not multipart', async () => {
    vendor.on((r) => r.path.startsWith('/upload/youtube/v3/thumbnails/set'), () => ({ status: 200, body: {} }));
    await setup().setThumbnail('ya29', 'vid123', Buffer.from('jpeg-bytes'), 'image/jpeg');

    const request = vendor.last();
    expect(request.path).toContain('videoId=vid123');
    expect(request.path).toContain('uploadType=media');
    expect(request.headers['content-type']).toBe('image/jpeg');
    expect(request.raw).toBe('jpeg-bytes');
  });

  it('reads the current snippet before updating, since videos.update replaces it', async () => {
    vendor
      .on((r) => r.method === 'GET' && r.path.startsWith('/youtube/v3/videos'), () => ({
        status: 200,
        body: { items: [{ id: 'v1', snippet: { title: 'Old', description: 'Old body', tags: ['keep'], categoryId: '22' } }] },
      }))
      .on((r) => r.method === 'PUT' && r.path.startsWith('/youtube/v3/videos'), () => ({ status: 200, body: {} }));

    await setup().updateMetadata('ya29', 'v1', { title: 'New title' });

    const put = vendor.requests[1]!;
    const body = put.body as { id: string; snippet: { title: string; description: string; tags: string[]; categoryId: string } };
    expect(body.id).toBe('v1');
    expect(body.snippet.title).toBe('New title');
    // Untouched fields must be carried over, or updating a title would wipe the description.
    expect(body.snippet.description).toBe('Old body');
    expect(body.snippet.tags).toEqual(['keep']);
    expect(body.snippet.categoryId).toBe('22');
  });

  it('reads analytics by column name and survives a missing impressions report', async () => {
    vendor
      .on((r) => r.path.includes('metrics=views'), () => ({
        status: 200,
        body: {
          columnHeaders: [
            { name: 'views' }, { name: 'estimatedMinutesWatched' }, { name: 'averageViewDuration' },
            { name: 'averageViewPercentage' }, { name: 'likes' }, { name: 'comments' },
            { name: 'shares' }, { name: 'subscribersGained' },
          ],
          rows: [[15_000, 42_000, 380, 47.5, 900, 120, 60, 310]],
        },
      }))
      // Not every channel is eligible for impression reporting.
      .on((r) => r.path.includes('impressions'), () => ({ status: 403, body: { error: { message: 'not eligible' } } }));

    const metrics = await setup().getMetrics('ya29', 'UCchannel', 'vid1', new Date('2026-09-01'));

    const report = vendor.requests[0]!;
    expect(report.path).toContain('ids=channel%3D%3DUCchannel');
    expect(report.path).toContain('filters=video%3D%3Dvid1');
    expect(report.path).toContain('startDate=2026-09-01');

    expect(metrics).toMatchObject({
      views: 15_000,
      watchTimeMinutes: 42_000,
      averageViewDuration: 380,
      averageViewPercentage: 47.5,
      subscribersGained: 310,
    });
    // The failure of the second report must not lose the first.
    expect(metrics.impressions).toBe(0);
    expect(metrics.ctr).toBe(0);
  });

  it('hydrates search results into full video records', async () => {
    vendor
      .on((r) => r.path.startsWith('/youtube/v3/search'), () => ({
        status: 200, body: { items: [{ id: { videoId: 'a1' } }, { id: { videoId: 'b2' } }] },
      }))
      .on((r) => r.path.startsWith('/youtube/v3/videos'), () => ({
        status: 200,
        body: {
          items: [
            { id: 'a1', snippet: { title: 'First', publishedAt: '2026-08-01T00:00:00Z' }, statistics: { viewCount: '5000', likeCount: '100' }, contentDetails: { duration: 'PT12M30S' } },
            { id: 'b2', snippet: { title: 'Second' }, statistics: { viewCount: '900' }, contentDetails: { duration: 'PT45S' } },
          ],
        },
      }));

    const videos = await setup().listPublicVideos('UCrival', 5);

    expect(vendor.requests[0]!.path).toContain('key=api-key');
    expect(videos).toHaveLength(2);
    expect(videos[0]).toMatchObject({ id: 'a1', title: 'First', views: 5000, durationSec: 750 });
    expect(videos[1]!.durationSec).toBe(45);
  });

  it('reports exactly which OAuth variables are missing', () => {
    const provider = new YouTubeProvider(config({ YOUTUBE_CLIENT_ID: 'only-id' }));
    expect(provider.isConfigured()).toBe(false);
    expect(provider.missingConfig()).toEqual(['YOUTUBE_CLIENT_SECRET']);

    const none = new YouTubeProvider(config({}));
    expect(none.missingConfig()).toEqual(['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET']);
    expect(() => none.authorizeUrl('s')).toThrow(ProviderNotConfiguredError);
  });

  it('requires an API key for public lookups and says so', async () => {
    const provider = new YouTubeProvider(config({ YOUTUBE_CLIENT_ID: 'c', YOUTUBE_CLIENT_SECRET: 's' }));
    await expect(provider.lookupPublicChannel('UC123')).rejects.toMatchObject({
      code: 'provider_not_configured',
    });
  });
});

// ── shared HTTP behaviour ────────────────────────────────────────────────────

describe('provider HTTP layer', () => {
  it('times out rather than hanging a pipeline step', async () => {
    vendor.on(() => true, () => ({ status: 200, body: {} }));
    const provider = new AnthropicProvider(
      config({ CLAUDE_API_KEY: 'k', ANTHROPIC_BASE_URL: 'http://127.0.0.1:9', PROVIDER_TIMEOUT_MS: '150' }),
    );
    await expect(provider.generateText({ system: 's', prompt: 'p' })).rejects.toMatchObject({
      retryable: true,
    });
  });

  it('marks 5xx retryable and 4xx permanent, so the router does the right thing', async () => {
    vendor.on((r) => r.path === '/v1/messages' && vendor.requests.length === 1, () => ({ status: 503, body: { error: { message: 'overloaded' } } }));
    vendor.on((r) => r.path === '/v1/messages', () => ({ status: 401, body: { error: { message: 'invalid x-api-key' } } }));

    const provider = new AnthropicProvider(config({ CLAUDE_API_KEY: 'k', ANTHROPIC_BASE_URL: baseUrl }));
    await expect(provider.generateText({ system: 's', prompt: 'p' })).rejects.toMatchObject({ retryable: true });
    await expect(provider.generateText({ system: 's', prompt: 'p' })).rejects.toMatchObject({ retryable: false });
  });
});
