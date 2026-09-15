import { usd, type Money } from '../shared/types.js';
import type { EstimateInput, QualityTier } from './types.js';

/**
 * Rate card (spec §19, §41). Used for *estimation and budgeting* only; the metering decorator
 * overwrites the estimate with the vendor-reported cost whenever the response carries one.
 * Nothing else in the codebase hard-codes a price.
 *
 * **Provenance matters here, because the budget guard and the cost optimiser act on these
 * numbers.** Each entry is marked `verified` or `unverified`:
 *
 * - `verified` — taken from the vendor's published pricing page.
 * - `unverified` — a plausible placeholder. The vendor's pricing was not reachable when this
 *   was written, so the number is a guess, not a quote. It is good enough to keep relative
 *   cost ordering sane and to stop a runaway, but it is not your actual bill.
 *
 * Correct an unverified rate the moment you see a real invoice. `PRICING_OVERRIDES` does that
 * from the environment, with no code change and no redeploy:
 *
 *   PRICING_OVERRIDES='{"higgsfield":{"videoPerSecond":{"standard":0.15}}}'
 */
export interface TokenRate {
  /** USD per 1M input tokens. */
  inputPerMillion: number;
  /** USD per 1M output tokens. */
  outputPerMillion: number;
}

export interface RateCard {
  text?: Record<string, TokenRate>;
  /** USD per generated image, by quality tier. */
  image?: Partial<Record<QualityTier, number>>;
  /** USD per second of generated video, by quality tier. */
  videoPerSecond?: Partial<Record<QualityTier, number>>;
  /** USD per 1000 characters of synthesised speech. */
  voicePerThousandChars?: number;
  /** USD per second of generated music. */
  musicPerSecond?: number;
  /** USD per API request (quota-metered APIs are free but rate-limited). */
  perRequest?: number;
}

export const RATE_CARD: Record<string, RateCard> = {
  anthropic: {
    text: {
      default: { inputPerMillion: 3, outputPerMillion: 15 },
      fast: { inputPerMillion: 1, outputPerMillion: 5 },
    },
  },
  openai: {
    text: {
      default: { inputPerMillion: 2, outputPerMillion: 8 },
      fast: { inputPerMillion: 0.4, outputPerMillion: 1.6 },
    },
    image: { draft: 0.02, standard: 0.04, premium: 0.17 },
  },
  higgsfield: {
    // UNVERIFIED. higgsfield.ai was unreachable from the environment this was built in, so
    // these are placeholders for the DoP tiers, quoted per second of generated footage, not
    // quotes. Replace them from your first invoice via PRICING_OVERRIDES.
    videoPerSecond: { draft: 0.06, standard: 0.12, premium: 0.24 },
    image: { draft: 0.02, standard: 0.03, premium: 0.05 },
  },
  elevenlabs: {
    // UNVERIFIED — elevenlabs.io was likewise unreachable. ElevenLabs bills in characters
    // against a plan quota rather than per call, so treat this as a per-character budgeting
    // proxy and set it from what your plan actually works out to.
    voicePerThousandChars: 0.18,
  },
  youtube: {
    perRequest: 0,
  },
  stock: {
    image: { draft: 0, standard: 0, premium: 0 },
    videoPerSecond: { draft: 0, standard: 0, premium: 0 },
  },
  local: {
    musicPerSecond: 0,
    voicePerThousandChars: 0,
  },
  // Mocks are free by construction; they are listed so cost reporting has an entry rather
  // than silently falling through to "unknown provider".
  'mock-llm': { text: { default: { inputPerMillion: 0, outputPerMillion: 0 } } },
  'mock-media': {
    image: { draft: 0, standard: 0, premium: 0 },
    videoPerSecond: { draft: 0, standard: 0, premium: 0 },
    musicPerSecond: 0,
  },
  'mock-voice': { voicePerThousandChars: 0 },
};

/**
 * Merge operator-supplied prices over the built-in card.
 *
 * A wrong price is not cosmetic: the budget guard pauses generation on it and the cost
 * optimiser picks providers by it. Rather than making someone fork the repo to fix a number
 * the vendor changed last week, `PRICING_OVERRIDES` carries a JSON object shaped exactly like
 * RATE_CARD and is deep-merged over it at startup.
 *
 *   PRICING_OVERRIDES='{"higgsfield":{"videoPerSecond":{"standard":0.15,"premium":0.30}}}'
 *
 * Unknown providers are added rather than rejected, so a new adapter can be priced without a
 * release. Malformed JSON throws at startup: a silently ignored override would be worse than
 * no override, because you would believe the correction had taken effect.
 */
export function applyPricingOverrides(raw: string | undefined, card: Record<string, RateCard> = RATE_CARD): void {
  if (!raw || !raw.trim()) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`PRICING_OVERRIDES is not valid JSON: ${(err as Error).message}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('PRICING_OVERRIDES must be a JSON object keyed by provider');
  }

  for (const [provider, override] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof override !== 'object' || override === null || Array.isArray(override)) {
      throw new Error(`PRICING_OVERRIDES.${provider} must be an object`);
    }
    const target: RateCard = card[provider] ?? {};
    for (const [field, value] of Object.entries(override as Record<string, unknown>)) {
      if (typeof value === 'number') {
        (target as Record<string, unknown>)[field] = value;
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Nested tables (text tiers, image/video quality tiers) merge key by key, so
        // overriding `standard` does not wipe `draft` and `premium`.
        const existing = ((target as Record<string, unknown>)[field] ?? {}) as Record<string, unknown>;
        (target as Record<string, unknown>)[field] = { ...existing, ...(value as Record<string, unknown>) };
      } else {
        throw new Error(`PRICING_OVERRIDES.${provider}.${field} must be a number or an object`);
      }
    }
    card[provider] = target;
  }
}

export function estimate(providerKey: string, input: EstimateInput, modelTier: 'default' | 'fast' = 'default'): Money {
  const card = RATE_CARD[providerKey];
  if (!card) return usd(0);
  const quality: QualityTier = ('quality' in input && input.quality) || 'standard';

  switch (input.capability) {
    case 'generateText':
    case 'generateStructuredOutput':
    case 'analyzeText':
    case 'research': {
      const rate = card.text?.[modelTier] ?? card.text?.default;
      if (!rate) return usd(0);
      return usd(
        (input.inputTokens / 1_000_000) * rate.inputPerMillion +
          (input.outputTokens / 1_000_000) * rate.outputPerMillion,
      );
    }
    case 'generateImage':
      return usd((card.image?.[quality] ?? 0) * input.images);
    case 'generateVideo':
      return usd((card.videoPerSecond?.[quality] ?? 0) * input.seconds);
    case 'generateVoice':
      return usd(((card.voicePerThousandChars ?? 0) * input.characters) / 1000);
    case 'generateMusic':
      return usd((card.musicPerSecond ?? 0) * input.seconds);
    case 'publish':
      return usd((card.perRequest ?? 0) * input.requests);
    default:
      return usd(0);
  }
}

/**
 * Rough token estimate used before a call is made. Deliberately conservative — over-
 * estimating spend is safe, under-estimating is not.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}
