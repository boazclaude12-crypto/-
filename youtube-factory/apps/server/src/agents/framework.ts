import type { ZodType, ZodTypeDef } from 'zod';
import type { AppConfig } from '../config/index.js';
import type { AgentRunRepository, DecisionRepository, UsageRepository } from '../db/ports.js';
import type { Clock } from '../shared/clock.js';
import { errorMessage, ValidationError } from '../shared/errors.js';
import { zodToJsonSchema } from '../shared/json-schema.js';
import type { Logger } from '../shared/logger.js';
import { withRetry } from '../shared/retry.js';
import type { AgentName, Decision } from '../shared/types.js';
import { estimateTokens } from '../providers/rates.js';
import { meter, type ProviderRegistry } from '../providers/registry.js';
import type { OperationContext, QualityTier, StructuredCapable } from '../providers/types.js';
import type { PromptLibrary } from './prompts/library.js';

export interface AgentDeps {
  config: AppConfig;
  registry: ProviderRegistry;
  prompts: PromptLibrary;
  clock: Clock;
  logger: Logger;
  repos: {
    agentRuns: AgentRunRepository;
    usage: UsageRepository;
    decisions: DecisionRepository;
  };
}

export interface AgentContext {
  channelId?: string;
  videoId?: string;
  jobId?: string;
  userId?: string;
  quality?: QualityTier;
  signal?: AbortSignal;
  /** Cost ceiling for this single agent call. */
  maxCostUsd?: number;
}

export interface AgentResult<O> {
  output: O;
  decision: Decision;
  usage: { costUsd: number; inputTokens: number; outputTokens: number; provider: string; model?: string };
  promptVersion: number;
}

/**
 * Base class for every agent (spec §76). `run` is the only path from the domain to a model
 * and it always performs the same six steps:
 *
 *   1. validate the input against the agent's schema (a bad call costs nothing),
 *   2. resolve the active prompt version for this channel from the prompt library,
 *   3. pick a provider from the registry and call it with the output JSON Schema,
 *   4. validate the response; on failure, one repair round-trip, then the next provider,
 *   5. write an AgentRun record (prompt version, provider, tokens, cost, latency, verdict),
 *   6. return the output together with an explainable decision.
 */
export abstract class Agent<I, O> {
  abstract readonly name: AgentName;
  abstract readonly promptName: string;
  /**
   * `any` as the schema's *input* type is deliberate: agent schemas use `.default()`, so a
   * schema's parsed output is stricter than what callers may pass in. The declared domain
   * type `I` is the post-parse shape, which is what every caller downstream relies on.
   */
  abstract readonly inputSchema: ZodType<I, ZodTypeDef, any>;
  abstract readonly outputSchema: ZodType<O, ZodTypeDef, any>;
  /** Description used as the tool/schema name at the provider boundary. */
  abstract readonly outputName: string;

  protected readonly maxTokens: number = 8192;
  protected readonly temperature: number = 0.6;

  constructor(protected readonly deps: AgentDeps) {}

  /** Maps validated input onto the prompt's template variables. */
  protected abstract variables(input: I, ctx: AgentContext): Promise<Record<string, unknown>> | Record<string, unknown>;

  /** Optional post-processing: normalise, clamp or enrich the model's output. */
  protected refine(output: O, _input: I): O | Promise<O> {
    return output;
  }

  /** Why this agent produced what it produced — surfaced in the UI (spec §79). */
  protected explain(output: O, _input: I): Decision {
    return {
      subject: this.name,
      decision: 'completed',
      reason: `${this.name} produced a validated ${this.outputName}.`,
      dataUsed: { promptName: this.promptName },
    };
  }

  async run(rawInput: I, ctx: AgentContext = {}): Promise<AgentResult<O>> {
    const parsedInput = this.inputSchema.safeParse(rawInput);
    if (!parsedInput.success) {
      throw new ValidationError(`${this.name} received invalid input`, parsedInput.error.flatten());
    }
    const input = parsedInput.data;

    const variables = await this.variables(input, ctx);
    const prompt = await this.deps.prompts.resolve(this.promptName, variables, ctx.userId ?? null);
    const schema = zodToJsonSchema(this.outputSchema as never) as unknown as Record<string, unknown>;

    const estimateInput = {
      capability: 'generateStructuredOutput' as const,
      inputTokens: estimateTokens(prompt.systemPrompt + prompt.userPrompt),
      outputTokens: this.maxTokens / 2,
      quality: ctx.quality,
    };

    const chain = this.deps.registry.chain({
      capability: 'generateStructuredOutput',
      estimate: estimateInput,
      maxCostUsd: ctx.maxCostUsd,
    });
    if (chain.length === 0) {
      throw new ValidationError(
        `No configured provider can run ${this.name}. Add an API key on the Providers screen, or enable OFFLINE_MODE to use the mock providers.`,
      );
    }

    const started = Date.now();
    let attempts = 0;
    let lastError: unknown;

    for (const candidate of chain) {
      const provider = candidate.entry.provider as unknown as StructuredCapable;
      const providerKey = candidate.entry.provider.key;
      const opCtx: OperationContext = {
        jobId: ctx.jobId,
        videoId: ctx.videoId,
        channelId: ctx.channelId,
        quality: ctx.quality,
        signal: ctx.signal,
      };

      try {
        const result = await withRetry(
          async (attempt) => {
            attempts += 1;
            const userPrompt =
              attempt === 1 || !lastError
                ? prompt.userPrompt
                : `${prompt.userPrompt}\n\nYour previous response was rejected by schema validation:\n${errorMessage(
                    lastError,
                  )}\nReturn a corrected result that satisfies the schema exactly.`;

            const response = await meter(
              { usage: this.deps.repos.usage },
              {
                providerKey,
                operation: `agent:${this.name}`,
                ctx: opCtx,
                estimated: candidate.estimatedCost,
                registry: this.deps.registry,
              },
              () =>
                provider.generateStructuredOutput<unknown>(
                  {
                    system: prompt.systemPrompt,
                    prompt: userPrompt,
                    schema,
                    schemaName: this.outputName,
                    maxTokens: this.maxTokens,
                    temperature: this.temperature,
                    quality: ctx.quality,
                  },
                  opCtx,
                ),
            );

            const validated = this.outputSchema.safeParse(response.data);
            if (!validated.success) {
              lastError = new ValidationError(
                `${this.name} output failed validation`,
                validated.error.flatten(),
              );
              throw lastError;
            }
            return { output: validated.data, response };
          },
          // Two attempts per provider: the original call plus one schema-repair round-trip.
          { attempts: 2, baseDelayMs: 400, maxDelayMs: 4_000, shouldRetry: () => true },
          this.deps.clock,
        );

        const refined = await this.refine(result.output, input);
        const decision = this.explain(refined, input);
        const latencyMs = Date.now() - started;

        await this.deps.repos.agentRuns.record({
          videoId: ctx.videoId ?? null,
          agent: this.name,
          promptId: prompt.id ?? null,
          promptName: prompt.name,
          promptVersion: prompt.version,
          provider: providerKey,
          model: result.response.usage.model ?? null,
          ok: true,
          attempts,
          latencyMs,
          costUsd: result.response.usage.cost.usd,
          input: truncateForLog(input),
          output: truncateForLog(refined),
          error: null,
        });

        if (ctx.videoId || ctx.channelId) {
          await this.deps.repos.decisions.record({
            videoId: ctx.videoId ?? null,
            channelId: ctx.channelId ?? null,
            subject: decision.subject,
            decision: decision.decision,
            reason: decision.reason,
            score: decision.score ?? null,
            dataUsed: decision.dataUsed ?? null,
          });
        }

        this.deps.logger.info('agent completed', {
          agent: this.name,
          provider: providerKey,
          videoId: ctx.videoId,
          latencyMs,
          costUsd: result.response.usage.cost.usd,
          promptVersion: prompt.version,
        });

        return {
          output: refined,
          decision,
          usage: {
            costUsd: result.response.usage.cost.usd,
            inputTokens: result.response.usage.inputUnits,
            outputTokens: result.response.usage.outputUnits,
            provider: providerKey,
            model: result.response.usage.model,
          },
          promptVersion: prompt.version,
        };
      } catch (err) {
        lastError = err;
        this.deps.logger.warn('agent provider failed, moving to next in chain', {
          agent: this.name,
          provider: providerKey,
          videoId: ctx.videoId,
          error: errorMessage(err),
        });
      }
    }

    await this.deps.repos.agentRuns.record({
      videoId: ctx.videoId ?? null,
      agent: this.name,
      promptId: prompt.id ?? null,
      promptName: prompt.name,
      promptVersion: prompt.version,
      provider: chain[0]?.entry.provider.key ?? 'none',
      model: null,
      ok: false,
      attempts,
      latencyMs: Date.now() - started,
      costUsd: 0,
      input: truncateForLog(input),
      output: null,
      error: errorMessage(lastError).slice(0, 1000),
    });

    throw lastError instanceof Error
      ? lastError
      : new ValidationError(`${this.name} failed with every configured provider`);
  }
}

/** Agent inputs/outputs can be large; store a bounded copy in the audit trail. */
function truncateForLog(value: unknown): unknown {
  const text = JSON.stringify(value);
  if (!text || text.length <= 20_000) return value;
  return { truncated: true, preview: `${text.slice(0, 20_000)}…` };
}
