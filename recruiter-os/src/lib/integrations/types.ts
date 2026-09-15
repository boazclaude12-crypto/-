/**
 * Outbound channel contracts.
 *
 * No provider is connected yet. Each channel therefore ships with a `mock` transport
 * that records the message and reports `delivered: false` with a clear reason, so the
 * UI can tell the truth ("נשמר, לא נשלח") instead of pretending a send happened.
 * Wiring a real provider means adding one implementation and setting an env var.
 */

export interface OutboundMessage {
  to: string;
  body: string;
  subject?: string;
  meta?: Record<string, unknown>;
}

export interface SendResult {
  delivered: boolean;
  provider: string;
  providerMessageId?: string;
  /** Human-readable Hebrew explanation shown to the user when delivered is false. */
  reason?: string;
}

export interface MessagingChannel {
  readonly name: 'whatsapp' | 'sms' | 'email';
  readonly provider: string;
  readonly isConnected: boolean;
  send(message: OutboundMessage): Promise<SendResult>;
}

export interface CalendarEvent {
  title: string;
  startsAt: string;
  durationMinutes: number;
  location?: string;
  description?: string;
  attendees?: string[];
}

export interface CalendarService {
  readonly provider: string;
  readonly isConnected: boolean;
  createEvent(event: CalendarEvent): Promise<{ created: boolean; eventId?: string; reason?: string }>;
  /** Always available: a downloadable .ics file needs no third-party account. */
  toIcs(event: CalendarEvent): string;
}
