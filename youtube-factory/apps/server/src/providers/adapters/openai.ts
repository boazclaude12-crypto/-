import type { AppConfig } from '../../config/index.js';
import { ProviderError, ProviderNotConfiguredError } from '../../shared/errors.js';
import type { Capability } from '../../shared/types.js';
import { request } from '../http.js';
import { estimate } from '../rates.js';
import type {
  AIProvider,
  EstimateInput,
  ImageCapable,
  ImageRequest,
  ImageResponse,
  OperationContext,
  ProviderHealth,
  StructuredCapable,
  StructuredRequest,
  StructuredResponse,
  TextCapable,
  TextRequest,
  TextResponse,
} from '../types.js';

/**
 * OpenAI adapter.
 *
 *   POST {baseUrl}/v1/chat/completions
 *     body: { model, messages, max_completion_tokens, response_format }
 *     structured output: response_format = { type: 'json_schema',
 *                                            json_schema: { name, schema, strict: true } }
 *   POST {baseUrl}/v1/images/generations
 *     body: { model, prompt, size, n, quality }  → data[].b64_json
 *
 * Also serves as the fallback text provider when Anthropic is unavailable, which is what
 * makes the provider chain in spec §64 real rather than theoretical.
 */
export class OpenAIProvider implements AIProvider, TextCapable, StructuredCapable, ImageCapable {
  readonly key = 'openai';
  readonly name = 'OpenAI';
  readonly capabilities: readonly Capability[] = [
    'generateText',
    'generateStructuredOutput',
    'analyzeText',
    'research',
    'generateImage',
  ];

  constructor(private readonly config: AppConfig) {}

  private get creds() {
    return this.config.providers.openai;
  }

  isConfigured(): boolean {
    return this.creds.key.present;
  }

  missingConfig(): string[] {
    return this.isConfigured() ? [] : ['OPENAI_API_KEY'];
  }

  estimateCost(input: EstimateInput) {
    return estimate(this.key, input, 'quality' in input && input.quality === 'draft' ? 'fast' : 'default');
  }

  private headers(): Record<string, string> {
    if (!this.isConfigured()) throw new ProviderNotConfiguredError(this.key, this.missingConfig());
    return {
      authorization: `Bearer ${this.creds.key.reveal()}`,
      'content-type': 'application/json',
    };
  }

  async health(): Promise<ProviderHealth> {
    if (!this.isConfigured()) return { ok: false, detail: 'No API key configured' };
    const started = Date.now();
    try {
      await request(this.key, `${this.creds.baseUrl}/v1/models`, {
        headers: this.headers(),
        method: 'GET',
        timeoutMs: 15_000,
      });
      return { ok: true, latencyMs: Date.now() - started };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - started, detail: (err as Error).message };
    }
  }

  async generateText(req: TextRequest, ctx: OperationContext = {}): Promise<TextResponse> {
    const res = await request<ChatCompletion>(this.key, `${this.creds.baseUrl}/v1/chat/completions`, {
      headers: this.headers(),
      body: {
        model: this.creds.model,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.prompt },
        ],
        max_completion_tokens: req.maxTokens ?? 4096,
        temperature: req.temperature ?? 0.7,
        ...(req.stopSequences?.length ? { stop: req.stopSequences } : {}),
      },
      timeoutMs: this.config.limits.providerTimeoutMs,
      signal: ctx.signal,
    });

    const text = res.data.choices[0]?.message?.content ?? '';
    return { text, usage: this.usageOf(res.data, 'generateText') };
  }

  async generateStructuredOutput<T = unknown>(
    req: StructuredRequest,
    ctx: OperationContext = {},
  ): Promise<StructuredResponse<T>> {
    const res = await request<ChatCompletion>(this.key, `${this.creds.baseUrl}/v1/chat/completions`, {
      headers: this.headers(),
      body: {
        model: this.creds.model,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.prompt },
        ],
        max_completion_tokens: req.maxTokens ?? 8192,
        temperature: req.temperature ?? 0.4,
        response_format: {
          type: 'json_schema',
          json_schema: { name: sanitiseSchemaName(req.schemaName), schema: req.schema, strict: true },
        },
      },
      timeoutMs: this.config.limits.providerTimeoutMs,
      signal: ctx.signal,
    });

    const raw = res.data.choices[0]?.message?.content ?? '';
    if (!raw) {
      throw new ProviderError(this.key, 'Model returned an empty structured response', { retryable: true });
    }
    let data: T;
    try {
      data = JSON.parse(raw) as T;
    } catch (err) {
      throw new ProviderError(this.key, 'Model returned invalid JSON', { retryable: true, cause: err });
    }
    return { data, raw, usage: this.usageOf(res.data, 'generateStructuredOutput') };
  }

  async generateImage(req: ImageRequest, ctx: OperationContext = {}): Promise<ImageResponse> {
    const count = req.count ?? 1;
    const res = await request<ImageGeneration>(this.key, `${this.creds.baseUrl}/v1/images/generations`, {
      headers: this.headers(),
      body: {
        model: this.creds.imageModel,
        prompt: buildImagePrompt(req),
        n: count,
        size: nearestSupportedSize(req.width, req.height),
        quality: req.quality === 'premium' ? 'high' : req.quality === 'draft' ? 'low' : 'medium',
      },
      timeoutMs: Math.max(this.config.limits.providerTimeoutMs, 180_000),
      signal: ctx.signal,
    });

    const images = (res.data.data ?? []).map((item) => ({
      bytes: item.b64_json ? Buffer.from(item.b64_json, 'base64') : undefined,
      url: item.url,
      mimeType: 'image/png',
      width: req.width,
      height: req.height,
    }));

    return {
      images,
      usage: {
        inputUnits: 0,
        outputUnits: images.length,
        unit: 'image',
        model: this.creds.imageModel,
        cost: estimate(this.key, { capability: 'generateImage', images: images.length, quality: req.quality }),
      },
    };
  }

  private usageOf(body: ChatCompletion, capability: 'generateText' | 'generateStructuredOutput') {
    const inputTokens = body.usage?.prompt_tokens ?? 0;
    const outputTokens = body.usage?.completion_tokens ?? 0;
    return {
      inputUnits: inputTokens,
      outputUnits: outputTokens,
      unit: 'token' as const,
      model: body.model ?? this.creds.model,
      cost: estimate(this.key, { capability, inputTokens, outputTokens }),
    };
  }
}

function buildImagePrompt(req: ImageRequest): string {
  const parts = [req.prompt];
  if (req.style) parts.push(`Style: ${req.style}.`);
  // The images endpoint has no negative-prompt field, so exclusions go into the prompt.
  if (req.negativePrompt) parts.push(`Avoid: ${req.negativePrompt}.`);
  return parts.join(' ');
}

/** The images endpoint accepts a fixed set of sizes; pick the closest by aspect ratio. */
function nearestSupportedSize(width: number, height: number): string {
  const ratio = width / height;
  if (ratio > 1.2) return '1536x1024';
  if (ratio < 0.83) return '1024x1536';
  return '1024x1024';
}

function sanitiseSchemaName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'structured_output';
}

interface ChatCompletion {
  model?: string;
  choices: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface ImageGeneration {
  data?: Array<{ b64_json?: string; url?: string }>;
}
