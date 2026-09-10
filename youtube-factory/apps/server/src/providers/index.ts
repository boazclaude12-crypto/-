import type { AppConfig } from '../config/index.js';
import type { Clock } from '../shared/clock.js';
import { systemClock } from '../shared/clock.js';
import type { Logger } from '../shared/logger.js';
import { nullLogger } from '../shared/logger.js';
import { AnthropicProvider } from './adapters/anthropic.js';
import { ElevenLabsProvider } from './adapters/elevenlabs.js';
import { HiggsfieldProvider } from './adapters/higgsfield.js';
import { LocalVisualProvider } from './adapters/local.js';
import { OpenAIProvider } from './adapters/openai.js';
import { YouTubeProvider } from './adapters/youtube.js';
import { MockLLMProvider, MockMediaProvider, MockVoiceProvider, MockYouTubeProvider } from './mock/index.js';
import { ProviderRegistry } from './registry.js';

export * from './types.js';
export * from './registry.js';
export { RATE_CARD, estimate, estimateTokens } from './rates.js';
export { YOUTUBE_SCOPES } from './adapters/youtube.js';

/**
 * Builds the provider registry for a process.
 *
 * `OFFLINE_MODE=true` (and the test environment) swaps every vendor for its mock, which is
 * what lets the acceptance run execute with no credentials and no spend. Otherwise real
 * adapters are registered unconditionally — an adapter without credentials reports
 * `isConfigured() === false` and the router simply never picks it, so a half-configured
 * deployment degrades instead of crashing (spec §81).
 *
 * The local FFmpeg provider is always registered last: it costs nothing, is always
 * available, and guarantees the fallback chain of spec §64 terminates in something usable.
 */
export function buildProviderRegistry(
  config: AppConfig,
  clock: Clock = systemClock,
  logger: Logger = nullLogger,
): ProviderRegistry {
  const registry = new ProviderRegistry(logger);

  if (config.offline) {
    registry.register(new MockLLMProvider(), { priority: 1, qualityTier: 'standard' });
    registry.register(new MockMediaProvider(config), { priority: 1, qualityTier: 'standard' });
    registry.register(new MockVoiceProvider(config), { priority: 1, qualityTier: 'standard' });
    registry.register(new MockYouTubeProvider(), { priority: 1, qualityTier: 'standard' });
    registry.register(new LocalVisualProvider(config), { priority: 50, qualityTier: 'draft' });
    return registry;
  }

  registry.register(new AnthropicProvider(config), { priority: 10, qualityTier: 'premium' });
  registry.register(new OpenAIProvider(config), { priority: 20, qualityTier: 'premium' });
  registry.register(new HiggsfieldProvider(config, clock), { priority: 10, qualityTier: 'premium' });
  registry.register(new ElevenLabsProvider(config), { priority: 10, qualityTier: 'premium' });
  registry.register(new YouTubeProvider(config), { priority: 10, qualityTier: 'standard' });
  registry.register(new LocalVisualProvider(config), { priority: 90, qualityTier: 'draft' });

  return registry;
}

export {
  AnthropicProvider,
  ElevenLabsProvider,
  HiggsfieldProvider,
  LocalVisualProvider,
  OpenAIProvider,
  YouTubeProvider,
  MockLLMProvider,
  MockMediaProvider,
  MockVoiceProvider,
  MockYouTubeProvider,
};
