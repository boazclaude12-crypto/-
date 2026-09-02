import { env } from '../env';
import { LocalAiProvider } from './local';
import { AnthropicAiProvider } from './anthropic';
import type { AiProvider } from './types';

export type { AiProvider, ChatRequest, GeneratedMessage, MessageRequest, MessageTone } from './types';
export { parseCvText, parsedCvToCandidateInput, type ParsedCv } from './cv-parser';

let cached: AiProvider | null = null;

/**
 * Resolves the configured AI provider once per process.
 *
 * `AI_PROVIDER=anthropic` with a key uses Claude; anything else uses the local engine.
 * Asking for Anthropic without a key falls back to local rather than failing at runtime.
 */
export function getAiProvider(): AiProvider {
  if (cached) return cached;
  if (env.aiProvider === 'anthropic') {
    const provider = new AnthropicAiProvider();
    cached = provider.isConfigured ? provider : new LocalAiProvider();
    if (!provider.isConfigured) {
      console.warn('[ai] AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is missing — using the local engine.');
    }
  } else {
    cached = new LocalAiProvider();
  }
  return cached;
}

/** Exposed on the settings screen so the user knows what is actually running. */
export function aiStatus() {
  const provider = getAiProvider();
  return {
    provider: provider.name,
    configured: provider.isConfigured,
    model: provider.name === 'anthropic' ? env.anthropicModel : null,
  };
}

/** Test seam: lets tests inject a stub provider. */
export function setAiProviderForTests(provider: AiProvider | null): void {
  cached = provider;
}
