import type { ParsedCv } from './cv-parser';

export type MessageTone = 'short' | 'professional' | 'friendly' | 'urgent' | 'followup';

export interface MessageRequest {
  tone: MessageTone;
  channel: 'whatsapp' | 'sms' | 'email';
  candidate: {
    name: string;
    current_role?: string | null;
    city?: string | null;
    years_experience?: number | null;
  };
  job?: {
    title: string;
    city?: string | null;
    salary_min?: number | null;
    salary_max?: number | null;
    salary_period?: string;
    employment_type?: string | null;
    client_name?: string | null;
    highlights?: string[];
  } | null;
  recruiter: { name: string };
  context?: string;
}

export interface GeneratedMessage {
  subject: string | null;
  body: string;
  provider: string;
}

export interface ChatRequest {
  question: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Facts retrieved from the user's own database — the only source of truth. */
  context: string;
}

export interface ChatAnswer {
  answer: string;
  provider: string;
}

/**
 * The AI surface the app depends on.
 *
 * Two implementations ship: a deterministic local engine that always works, and an
 * Anthropic-backed one used when an API key is configured. Swapping providers is an
 * env change, never a code change in feature modules.
 */
export interface AiProvider {
  readonly name: string;
  readonly isConfigured: boolean;
  parseCv(text: string): Promise<ParsedCv>;
  generateMessage(request: MessageRequest): Promise<GeneratedMessage>;
  answer(request: ChatRequest): Promise<ChatAnswer>;
}
