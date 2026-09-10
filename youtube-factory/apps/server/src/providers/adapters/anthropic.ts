import type { AppConfig } from '../../config/index.js';
import { ProviderError, ProviderNotConfiguredError } from '../../shared/errors.js';
import type { Capability } from '../../shared/types.js';
import { request } from '../http.js';
import { estimate, estimateTokens } from '../rates.js';
import type {
  AIProvider,
  EstimateInput,
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
 * Anthropic Messages API.
 *
 *   POST {baseUrl}/v1/messages
 *   headers: x-api-key, anthropic-version: 2023-06-01, content-type: application/json
 *   body:    { model, max_tokens, system, messages:[{role,content}], tools?, tool_choice? }
 *   usage:   { input_tokens, output_tokens }
 *
 * Structured output is produced with a forced single-tool call rather than by asking for
 * JSON in prose: the tool's `input_schema` is the contract, so the model cannot answer with
 * commentary around the object.
 */
export class AnthropicProvider implements AIProvider, TextCapable, StructuredCapable {
  readonly key = 'anthropic';
  readonly name = 'Anthropic Claude';
  readonly capabilities: readonly Capability[] = [
    'generateText',
    'generateStructuredOutput',
    'analyzeText',
    'research',
  ];

  constructor(private readonly config: AppConfig) {}

  private get creds() {
    return this.config.providers.anthropic;
  }

  isConfigured(): boolean {
    return this.creds.key.present;
  }

  missingConfig(): string[] {
    return this.isConfigured() ? [] : ['CLAUDE_API_KEY (or ANTHROPIC_API_KEY)'];
  }

  private modelFor(quality?: string): { model: string; tier: 'default' | 'fast' } {
    return quality === 'draft'
      ? { model: this.creds.fastModel, tier: 'fast' }
      : { model: this.creds.model, tier: 'default' };
  }

  estimateCost(input: EstimateInput) {
    const tier = 'quality' in input && input.quality === 'draft' ? 'fast' : 'default';
    return estimate(this.key, input, tier);
  }

  private headers(): Record<string, string> {
    if (!this.isConfigured()) throw new ProviderNotConfiguredError(this.key, this.missingConfig());
    return {
      'x-api-key': this.creds.key.reveal(),
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    };
  }

  async health(): Promise<ProviderHealth> {
    if (!this.isConfigured()) return { ok: false, detail: 'No API key configured' };
    const started = Date.now();
    try {
      // A one-token completion is the cheapest liveness probe the API offers.
      await request(this.key, `${this.creds.baseUrl}/v1/messages`, {
        headers: this.headers(),
        body: {
          model: this.creds.fastModel,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        },
        timeoutMs: 15_000,
      });
      return { ok: true, latencyMs: Date.now() - started };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - started, detail: (err as Error).message };
    }
  }

  async generateText(req: TextRequest, ctx: OperationContext = {}): Promise<TextResponse> {
    const { model, tier } = this.modelFor(req.quality ?? ctx.quality);
    const res = await request<AnthropicMessage>(this.key, `${this.creds.baseUrl}/v1/messages`, {
      headers: this.headers(),
      body: {
        model,
        max_tokens: req.maxTokens ?? 4096,
        temperature: req.temperature ?? 0.7,
        system: req.system,
        messages: [{ role: 'user', content: req.prompt }],
        ...(req.stopSequences?.length ? { stop_sequences: req.stopSequences } : {}),
      },
      timeoutMs: this.config.limits.providerTimeoutMs,
      signal: ctx.signal,
    });

    const text = res.data.content
      .filter((block): block is AnthropicTextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      text,
      usage: {
        inputUnits: res.data.usage.input_tokens,
        outputUnits: res.data.usage.output_tokens,
        unit: 'token',
        model,
        cost: estimate(
          this.key,
          {
            capability: 'generateText',
            inputTokens: res.data.usage.input_tokens,
            outputTokens: res.data.usage.output_tokens,
          },
          tier,
        ),
      },
    };
  }

  async generateStructuredOutput<T = unknown>(
    req: StructuredRequest,
    ctx: OperationContext = {},
  ): Promise<StructuredResponse<T>> {
    const { model, tier } = this.modelFor(req.quality ?? ctx.quality);
    const toolName = sanitiseToolName(req.schemaName);

    const res = await request<AnthropicMessage>(this.key, `${this.creds.baseUrl}/v1/messages`, {
      headers: this.headers(),
      body: {
        model,
        max_tokens: req.maxTokens ?? 8192,
        temperature: req.temperature ?? 0.4,
        system: req.system,
        messages: [{ role: 'user', content: req.prompt }],
        tools: [
          {
            name: toolName,
            description: `Return the ${req.schemaName} result. Every field is required unless the schema marks it optional.`,
            input_schema: req.schema,
          },
        ],
        tool_choice: { type: 'tool', name: toolName },
      },
      timeoutMs: this.config.limits.providerTimeoutMs,
      signal: ctx.signal,
    });

    const toolUse = res.data.content.find(
      (block): block is AnthropicToolUseBlock =>
        block.type === 'tool_use' && (block as AnthropicToolUseBlock).name === toolName,
    );
    if (!toolUse) {
      throw new ProviderError(this.key, 'Model did not return the requested structured output', {
        retryable: true,
        details: { stopReason: res.data.stop_reason },
      });
    }

    return {
      data: toolUse.input as T,
      raw: JSON.stringify(toolUse.input),
      usage: {
        inputUnits: res.data.usage.input_tokens,
        outputUnits: res.data.usage.output_tokens,
        unit: 'token',
        model,
        cost: estimate(
          this.key,
          {
            capability: 'generateStructuredOutput',
            inputTokens: res.data.usage.input_tokens,
            outputTokens: res.data.usage.output_tokens,
          },
          tier,
        ),
      },
    };
  }
}

/** Tool names must match ^[a-zA-Z0-9_-]{1,64}$. */
function sanitiseToolName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return cleaned || 'structured_output';
}

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}
interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}
type AnthropicBlock = AnthropicTextBlock | AnthropicToolUseBlock | { type: string };

interface AnthropicMessage {
  id: string;
  model: string;
  stop_reason: string | null;
  content: AnthropicBlock[];
  usage: { input_tokens: number; output_tokens: number };
}

export { estimateTokens };
