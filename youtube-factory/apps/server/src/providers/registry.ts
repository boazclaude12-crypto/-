import type { AppConfig } from '../config/index.js';
import type { UsageRepository } from '../db/ports.js';
import { CircuitBreaker } from '../shared/retry.js';
import { errorMessage, ProviderError } from '../shared/errors.js';
import type { Logger } from '../shared/logger.js';
import { nullLogger } from '../shared/logger.js';
import type { Capability, Money } from '../shared/types.js';
import { usd } from '../shared/types.js';
import type {
  AIProvider,
  EstimateInput,
  OperationContext,
  ProviderHealth,
  PublishingProvider,
  QualityTier,
  Usage,
} from './types.js';
import {
  isImageCapable,
  isMusicCapable,
  isPublishingProvider,
  isStructuredCapable,
  isTextCapable,
  isVideoCapable,
  isVoiceCapable,
} from './types.js';

export interface ProviderEntry {
  provider: AIProvider;
  /** Lower runs first when cost and quality tie. */
  priority: number;
  qualityTier: QualityTier;
  breaker: CircuitBreaker;
  latencySamples: number[];
}

export interface SelectionOptions {
  capability: Capability;
  estimate?: EstimateInput;
  /** Skip these provider keys — used when walking a fallback chain. */
  exclude?: string[];
  /** Refuse providers below this tier. */
  minQuality?: QualityTier;
  /** Hard ceiling for this single operation, in USD. */
  maxCostUsd?: number;
  preferKey?: string;
}

export interface Selection {
  entry: ProviderEntry;
  estimatedCost: Money;
}

const TIER_RANK: Record<QualityTier, number> = { draft: 0, standard: 1, premium: 2 };

const CAPABILITY_GUARDS: Record<Capability, (p: AIProvider) => boolean> = {
  generateText: isTextCapable,
  generateStructuredOutput: isStructuredCapable,
  analyzeText: isTextCapable,
  research: isTextCapable,
  generateImage: isImageCapable,
  generateVideo: isVideoCapable,
  generateVoice: isVoiceCapable,
  generateMusic: isMusicCapable,
  publish: isPublishingProvider,
};

/**
 * Holds every configured provider and answers "who should run this?" (spec §3).
 *
 * Selection order:
 *   1. configured, declares the capability, and actually implements its methods
 *   2. circuit breaker closed
 *   3. within the per-operation cost ceiling
 *   4. sorted by (quality tier ≥ required) desc, estimated cost asc, observed p95 latency asc
 */
export class ProviderRegistry {
  private readonly entries: ProviderEntry[] = [];

  constructor(private readonly logger: Logger = nullLogger) {}

  register(provider: AIProvider, opts: { priority?: number; qualityTier?: QualityTier } = {}): this {
    this.entries.push({
      provider,
      priority: opts.priority ?? 100,
      qualityTier: opts.qualityTier ?? 'standard',
      breaker: new CircuitBreaker(),
      latencySamples: [],
    });
    return this;
  }

  all(): ProviderEntry[] {
    return [...this.entries];
  }

  get(key: string): AIProvider | undefined {
    return this.entries.find((e) => e.provider.key === key)?.provider;
  }

  /** The publishing provider the pipeline may actually use — configured only. */
  publishing(): PublishingProvider | undefined {
    const entry = this.entries.find((e) => isPublishingProvider(e.provider) && e.provider.isConfigured());
    return entry ? (entry.provider as PublishingProvider) : undefined;
  }

  /**
   * The registered publishing adapter regardless of configuration. Used by the Channels
   * screen and the connect route, which need to tell the user *which* variables are missing
   * rather than reporting that no provider exists at all.
   */
  publishingAdapter(): PublishingProvider | undefined {
    const entry = this.entries.find((e) => isPublishingProvider(e.provider));
    return entry ? (entry.provider as PublishingProvider) : undefined;
  }

  /** Ordered candidate list — index 0 is the primary, the rest are the fallback chain. */
  chain(opts: SelectionOptions): Selection[] {
    const guard = CAPABILITY_GUARDS[opts.capability];
    const now = Date.now();
    const candidates = this.entries
      .filter((entry) => {
        if (opts.exclude?.includes(entry.provider.key)) return false;
        if (!entry.provider.isConfigured()) return false;
        if (!entry.provider.capabilities.includes(opts.capability)) return false;
        if (!guard(entry.provider)) return false;
        if (entry.breaker.isOpen(now)) return false;
        if (opts.minQuality && TIER_RANK[entry.qualityTier] < TIER_RANK[opts.minQuality]) return false;
        return true;
      })
      .map((entry) => ({
        entry,
        estimatedCost: opts.estimate ? entry.provider.estimateCost(opts.estimate) : usd(0),
      }))
      .filter((c) => opts.maxCostUsd === undefined || c.estimatedCost.usd <= opts.maxCostUsd);

    candidates.sort((a, b) => {
      if (opts.preferKey) {
        const aPref = a.entry.provider.key === opts.preferKey ? 0 : 1;
        const bPref = b.entry.provider.key === opts.preferKey ? 0 : 1;
        if (aPref !== bPref) return aPref - bPref;
      }
      const tier = TIER_RANK[b.entry.qualityTier] - TIER_RANK[a.entry.qualityTier];
      const cost = a.estimatedCost.usd - b.estimatedCost.usd;
      if (Math.abs(cost) > 1e-9) return cost;
      if (tier !== 0) return tier;
      const latency = p95(a.entry.latencySamples) - p95(b.entry.latencySamples);
      if (Math.abs(latency) > 1) return latency;
      return a.entry.priority - b.entry.priority;
    });

    return candidates;
  }

  select(opts: SelectionOptions): Selection {
    const chain = this.chain(opts);
    const first = chain[0];
    if (!first) {
      throw new ProviderError('registry', `No configured provider supports "${opts.capability}"`, {
        retryable: false,
        details: {
          capability: opts.capability,
          configured: this.entries.map((e) => ({
            key: e.provider.key,
            configured: e.provider.isConfigured(),
            missing: e.provider.missingConfig(),
            capabilities: e.provider.capabilities,
          })),
        },
      });
    }
    return first;
  }

  recordSuccess(key: string, latencyMs: number): void {
    const entry = this.entries.find((e) => e.provider.key === key);
    if (!entry) return;
    entry.breaker.recordSuccess();
    entry.latencySamples.push(latencyMs);
    if (entry.latencySamples.length > 50) entry.latencySamples.shift();
  }

  recordFailure(key: string, err: unknown): void {
    const entry = this.entries.find((e) => e.provider.key === key);
    if (!entry) return;
    entry.breaker.recordFailure();
    this.logger.warn('provider call failed', { provider: key, error: errorMessage(err) });
  }

  async healthAll(): Promise<Array<{ key: string; name: string; configured: boolean; missing: string[]; capabilities: Capability[]; health: ProviderHealth }>> {
    return Promise.all(
      this.entries.map(async (entry) => ({
        key: entry.provider.key,
        name: entry.provider.name,
        configured: entry.provider.isConfigured(),
        missing: entry.provider.missingConfig(),
        capabilities: [...entry.provider.capabilities],
        health: entry.provider.isConfigured()
          ? await entry.provider.health().catch((err) => ({ ok: false, detail: errorMessage(err) }))
          : { ok: false, detail: 'Not configured' },
      })),
    );
  }
}

function p95(samples: number[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
}

export interface MeterSink {
  usage: UsageRepository;
}

/**
 * Wraps a provider call so that every single one lands in `ApiUsage` with the ids the
 * observability requirements ask for (spec §44) and the numbers the cost dashboard reads
 * (spec §41). The vendor-reported cost always wins over the pre-call estimate.
 */
export async function meter<T extends { usage: Usage }>(
  sink: MeterSink,
  args: {
    providerKey: string;
    operation: string;
    ctx: OperationContext;
    estimated: Money;
    registry?: ProviderRegistry;
  },
  run: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  try {
    const result = await run();
    const latencyMs = Date.now() - started;
    args.registry?.recordSuccess(args.providerKey, latencyMs);
    await sink.usage.record({
      channelId: args.ctx.channelId ?? null,
      videoId: args.ctx.videoId ?? null,
      jobId: args.ctx.jobId ?? null,
      provider: args.providerKey,
      operation: args.operation,
      model: result.usage.model ?? null,
      inputUnits: result.usage.inputUnits,
      outputUnits: result.usage.outputUnits,
      unit: result.usage.unit,
      estimatedCost: args.estimated.usd,
      actualCost: result.usage.cost.usd,
      latencyMs,
      status: 'ok',
      error: null,
    });
    return result;
  } catch (err) {
    const latencyMs = Date.now() - started;
    args.registry?.recordFailure(args.providerKey, err);
    await sink.usage
      .record({
        channelId: args.ctx.channelId ?? null,
        videoId: args.ctx.videoId ?? null,
        jobId: args.ctx.jobId ?? null,
        provider: args.providerKey,
        operation: args.operation,
        model: null,
        inputUnits: 0,
        outputUnits: 0,
        unit: 'request',
        estimatedCost: args.estimated.usd,
        // A failed call still burns quota; record it at zero so it is visible but not billed.
        actualCost: 0,
        latencyMs,
        status: 'error',
        error: errorMessage(err).slice(0, 500),
      })
      .catch(() => undefined);
    throw err;
  }
}

export function describeRegistry(registry: ProviderRegistry, config: AppConfig) {
  return {
    offline: config.offline,
    providers: registry.all().map((entry) => ({
      key: entry.provider.key,
      name: entry.provider.name,
      capabilities: [...entry.provider.capabilities],
      configured: entry.provider.isConfigured(),
      missing: entry.provider.missingConfig(),
      qualityTier: entry.qualityTier,
      priority: entry.priority,
    })),
  };
}
