import { usd, type Money } from '../shared/types.js';
import type { EstimateInput, QualityTier } from './types.js';

/**
 * Rate card (spec §19, §41). These are list prices used for *estimation and budgeting*;
 * the metering decorator overwrites the estimate with the vendor-reported cost whenever the
 * response carries one. Update this table when a vendor changes pricing — nothing else in
 * the codebase hard-codes a price.
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
    // DoP tiers, quoted per second of generated footage.
    videoPerSecond: { draft: 0.06, standard: 0.12, premium: 0.24 },
    image: { draft: 0.02, standard: 0.03, premium: 0.05 },
  },
  elevenlabs: {
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
