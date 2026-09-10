import type { AppConfig } from '../../config/index.js';
import type { Clock } from '../../shared/clock.js';
import { systemClock } from '../../shared/clock.js';
import { ProviderError, ProviderNotConfiguredError } from '../../shared/errors.js';
import type { Capability } from '../../shared/types.js';
import { download, pollUntil, request } from '../http.js';
import { estimate } from '../rates.js';
import type {
  AIProvider,
  EstimateInput,
  ImageCapable,
  ImageRequest,
  ImageResponse,
  OperationContext,
  ProviderHealth,
  VideoCapable,
  VideoRequest,
  VideoResponse,
} from '../types.js';

/**
 * Higgsfield platform API (v2), implemented against the vendor's published SDK contract:
 *
 *   base      https://platform.higgsfield.ai
 *   auth      Authorization: Key <KEY_ID>:<KEY_SECRET>
 *   image     POST /v1/text2image/soul
 *               { prompt, width_and_height, quality, batch_size, style_id?,
 *                 style_strength?, image_reference?, enhance_prompt?, seed? }
 *   video     POST /v1/image2video/dop
 *               { model: 'dop-lite'|'dop-turbo'|'dop-standard', prompt,
 *                 input_images:[{ type:'image_url', image_url }], motions?, seed?,
 *                 enhance_prompt? }
 *   webhook   append ?hf_webhook=<url-encoded callback>
 *   poll      GET /requests/{request_id}/status
 *               → { status, request_id, status_url, cancel_url, images?[], video? }
 *   status    queued | in_progress | completed | failed | nsfw
 *   errors    401 auth · 403 out of credits · 400 bad input · 422 validation
 *
 * There is no text-to-video endpoint in this API. Text→video is therefore composed
 * honestly as text2image/soul followed by image2video/dop — the same path the vendor's own
 * SDK supports — rather than inventing an endpoint that does not exist (spec §4, §81).
 */
export class HiggsfieldProvider implements AIProvider, ImageCapable, VideoCapable {
  readonly key = 'higgsfield';
  readonly name = 'Higgsfield';
  readonly capabilities: readonly Capability[] = ['generateImage', 'generateVideo'];

  constructor(
    private readonly config: AppConfig,
    private readonly clock: Clock = systemClock,
  ) {}

  private get creds() {
    return this.config.providers.higgsfield;
  }

  isConfigured(): boolean {
    return this.creds.keyId.present && this.creds.keySecret.present;
  }

  missingConfig(): string[] {
    if (this.isConfigured()) return [];
    return ['HF_CREDENTIALS ("KEY_ID:KEY_SECRET") or HF_API_KEY + HF_API_SECRET'];
  }

  estimateCost(input: EstimateInput) {
    return estimate(this.key, input);
  }

  private headers(): Record<string, string> {
    if (!this.isConfigured()) throw new ProviderNotConfiguredError(this.key, this.missingConfig());
    return {
      authorization: `Key ${this.creds.keyId.reveal()}:${this.creds.keySecret.reveal()}`,
      'content-type': 'application/json',
    };
  }

  async health(): Promise<ProviderHealth> {
    if (!this.isConfigured()) return { ok: false, detail: 'No credentials configured' };
    const started = Date.now();
    try {
      // Asking for an unknown request id proves credentials and reachability without spend.
      await request(this.key, `${this.creds.baseUrl}/requests/healthcheck/status`, {
        headers: this.headers(),
        method: 'GET',
        timeoutMs: 15_000,
      });
      return { ok: true, latencyMs: Date.now() - started };
    } catch (err) {
      const message = (err as Error).message;
      const status = (err as ProviderError).details as { status?: number } | undefined;
      // 404 means "authenticated, no such request" — that is a healthy endpoint.
      if (status?.status === 404) return { ok: true, latencyMs: Date.now() - started };
      return { ok: false, latencyMs: Date.now() - started, detail: message };
    }
  }

  private endpointWithWebhook(path: string, webhookUrl?: string): string {
    const url = `${this.creds.baseUrl}${path}`;
    const hook = webhookUrl ?? this.creds.webhookUrl;
    if (!hook) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}hf_webhook=${encodeURIComponent(hook)}`;
  }

  private async submitAndAwait(path: string, body: object, ctx: OperationContext, webhookUrl?: string) {
    const submitted = await request<HiggsfieldResponse>(this.key, this.endpointWithWebhook(path, webhookUrl), {
      headers: this.headers(),
      body,
      timeoutMs: this.config.limits.providerTimeoutMs,
      signal: ctx.signal,
    });

    if (isTerminal(submitted.data.status)) return this.assertOk(submitted.data);
    if (!submitted.data.request_id) {
      throw new ProviderError(this.key, 'Submission returned neither a result nor a request id', {
        retryable: true,
      });
    }

    const final = await pollUntil(
      async () => {
        const res = await request<HiggsfieldResponse>(
          this.key,
          `${this.creds.baseUrl}/requests/${submitted.data.request_id}/status`,
          { headers: this.headers(), method: 'GET', timeoutMs: 30_000, signal: ctx.signal },
        );
        return res.data;
      },
      (value) => isTerminal(value.status),
      {
        intervalMs: 2_000,
        timeoutMs: 15 * 60_000,
        sleep: (ms) => this.clock.sleep(ms),
      },
    );
    return this.assertOk(final);
  }

  private assertOk(res: HiggsfieldResponse): HiggsfieldResponse {
    if (res.status === 'failed') {
      throw new ProviderError(this.key, 'Higgsfield reported the generation as failed', {
        retryable: true,
        details: { requestId: res.request_id },
      });
    }
    if (res.status === 'nsfw') {
      // A safety refusal is deterministic — retrying the same prompt will refuse again.
      throw new ProviderError(this.key, 'Higgsfield rejected the prompt as NSFW', {
        retryable: false,
        details: { requestId: res.request_id },
      });
    }
    return res;
  }

  async generateImage(req: ImageRequest, ctx: OperationContext = {}): Promise<ImageResponse> {
    const body: Record<string, unknown> = {
      prompt: composePrompt(req.prompt, req.style, req.negativePrompt),
      width_and_height: soulSize(req.width, req.height),
      quality: req.quality === 'draft' ? '720p' : '1080p',
      batch_size: (req.count ?? 1) >= 4 ? 4 : 1,
      enhance_prompt: true,
    };
    if (req.seed !== undefined) body.seed = req.seed;
    if (req.referenceImageUrl) {
      body.image_reference = { type: 'image_url', image_url: req.referenceImageUrl };
    }

    const result = await this.submitAndAwait('/v1/text2image/soul', body, ctx);
    const urls = (result.images ?? []).map((i) => i.url).filter(Boolean);
    if (urls.length === 0) {
      throw new ProviderError(this.key, 'Higgsfield returned no images', { retryable: true });
    }

    const images = await Promise.all(
      urls.slice(0, req.count ?? 1).map(async (url) => {
        const { bytes, mimeType } = await download(this.key, url);
        return { bytes, url, mimeType, width: req.width, height: req.height };
      }),
    );

    return {
      images,
      usage: {
        inputUnits: 0,
        outputUnits: images.length,
        unit: 'image',
        model: 'soul',
        cost: estimate(this.key, { capability: 'generateImage', images: images.length, quality: req.quality }),
      },
    };
  }

  async generateVideo(req: VideoRequest, ctx: OperationContext = {}): Promise<VideoResponse> {
    if (!req.imageUrl) {
      throw new ProviderError(
        this.key,
        'Higgsfield DoP is an image-to-video model: generate or supply a first frame before requesting video',
        { retryable: false },
      );
    }

    const model = modelForQuality(req.quality) ?? this.creds.videoModel;
    const body: Record<string, unknown> = {
      model,
      prompt: composePrompt(req.prompt, req.motion, req.negativePrompt),
      input_images: [{ type: 'image_url', image_url: req.imageUrl }],
      enhance_prompt: true,
    };
    if (req.seed !== undefined) body.seed = req.seed;

    const result = await this.submitAndAwait('/v1/image2video/dop', body, ctx, req.webhookUrl);
    const url = result.video?.url;
    if (!url) throw new ProviderError(this.key, 'Higgsfield returned no video URL', { retryable: true });

    const { bytes, mimeType } = await download(this.key, url, { timeoutMs: 300_000 });
    return {
      video: {
        bytes,
        url,
        mimeType: mimeType.startsWith('video/') ? mimeType : 'video/mp4',
        durationSec: req.durationSec,
        externalId: result.request_id,
      },
      usage: {
        inputUnits: 0,
        outputUnits: req.durationSec,
        unit: 'second',
        model,
        cost: estimate(this.key, {
          capability: 'generateVideo',
          seconds: req.durationSec,
          quality: req.quality,
        }),
      },
    };
  }
}

function modelForQuality(quality?: string): 'dop-lite' | 'dop-turbo' | 'dop-standard' | undefined {
  if (quality === 'draft') return 'dop-lite';
  if (quality === 'premium') return 'dop-standard';
  if (quality === 'standard') return 'dop-turbo';
  return undefined;
}

/**
 * DoP and Soul take a single prompt string with no negative-prompt field, so exclusions are
 * expressed inside the prompt rather than silently dropped.
 */
function composePrompt(prompt: string, extra?: string, negative?: string): string {
  const parts = [prompt];
  if (extra) parts.push(extra);
  if (negative) parts.push(`Avoid: ${negative}.`);
  return parts.join(' ').trim();
}

function soulSize(width: number, height: number): string {
  const ratio = width / height;
  if (ratio > 1.5) return '1536x864';
  if (ratio > 1.2) return '1280x720';
  if (ratio < 0.7) return '864x1536';
  if (ratio < 0.9) return '720x1280';
  return '1024x1024';
}

function isTerminal(status: string): boolean {
  return status === 'completed' || status === 'failed' || status === 'nsfw';
}

interface HiggsfieldResponse {
  status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'nsfw';
  request_id: string;
  status_url?: string;
  cancel_url?: string;
  images?: Array<{ url: string }>;
  video?: { url: string };
}
