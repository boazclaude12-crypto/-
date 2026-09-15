import { parseCvText, type ParsedCv } from './cv-parser';
import { renderMessage } from './templates';
import type { AiProvider, ChatAnswer, ChatRequest, GeneratedMessage, MessageRequest } from './types';

/**
 * The always-available engine: rule-based CV parsing, Hebrew message templates and
 * answers assembled from data already retrieved out of the user's own database.
 *
 * It needs no API key, sends nothing anywhere, and is deterministic — which makes it
 * both the default and the fallback when a remote provider fails.
 */
export class LocalAiProvider implements AiProvider {
  readonly name = 'local';
  readonly isConfigured = true;

  async parseCv(text: string): Promise<ParsedCv> {
    return parseCvText(text);
  }

  async generateMessage(request: MessageRequest): Promise<GeneratedMessage> {
    return renderMessage(request);
  }

  async answer(request: ChatRequest): Promise<ChatAnswer> {
    // The retrieval layer has already turned the question into a factual answer;
    // there is nothing to add without inventing something.
    return { answer: request.context, provider: this.name };
  }
}
