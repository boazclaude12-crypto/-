import type { MessagingChannel, OutboundMessage, SendResult } from './types';

const NOT_CONNECTED =
  'לא מחובר ספק שליחה. ההודעה נשמרה בהיסטוריה ואפשר להעתיק או לפתוח בוואטסאפ ידנית.';

/**
 * The transport used until a real provider is configured. It never claims a send
 * succeeded — that honesty is the point.
 */
export class MockChannel implements MessagingChannel {
  readonly name: MessagingChannel['name'];
  readonly provider = 'mock';
  readonly isConnected = false;

  constructor(name: MessagingChannel['name']) {
    this.name = name;
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    console.info(`[${this.name}:mock] would send to ${message.to}: ${message.body.slice(0, 80)}…`);
    return { delivered: false, provider: 'mock', reason: NOT_CONNECTED };
  }
}
