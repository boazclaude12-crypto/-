import { env } from '../env';
import { MockChannel } from './mock';
import type { CalendarEvent, CalendarService, MessagingChannel } from './types';

export type { MessagingChannel, OutboundMessage, SendResult, CalendarEvent, CalendarService } from './types';

/**
 * Channel registry. `AI_PROVIDER`-style env switches decide the implementation;
 * everything above this module depends only on the interface.
 */
export function getChannel(name: 'whatsapp' | 'sms' | 'email'): MessagingChannel {
  const config = env.channel(name);
  switch (config.provider) {
    // Real providers plug in here, e.g.:
    //   case 'twilio': return new TwilioChannel(name, config);
    //   case 'meta':   return new MetaWhatsAppChannel(config);
    case 'mock':
    default:
      return new MockChannel(name);
  }
}

class LocalCalendar implements CalendarService {
  readonly provider = 'mock';
  readonly isConnected = false;

  async createEvent() {
    return {
      created: false,
      reason: 'לא מחובר יומן. אפשר להוריד קובץ הזמנה (.ics) ולהוסיף אותו ליומן שלך.',
    };
  }

  /** RFC 5545 output — genuinely importable into any calendar app. */
  toIcs(event: CalendarEvent): string {
    const stamp = (value: string) => new Date(value).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const end = new Date(new Date(event.startsAt).getTime() + event.durationMinutes * 60_000).toISOString();
    const escape = (value: string) => value.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Recruiter OS//HE',
      'BEGIN:VEVENT',
      `UID:${stamp(event.startsAt)}-${Math.random().toString(36).slice(2)}@recruiter-os`,
      `DTSTAMP:${stamp(new Date().toISOString())}`,
      `DTSTART:${stamp(event.startsAt)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${escape(event.title)}`,
      event.location ? `LOCATION:${escape(event.location)}` : '',
      event.description ? `DESCRIPTION:${escape(event.description)}` : '',
      'END:VEVENT',
      'END:VCALENDAR',
    ].filter(Boolean).join('\r\n');
  }
}

export function getCalendar(): CalendarService {
  return new LocalCalendar();
}

/** Connection status for the settings screen. */
export function integrationStatus() {
  return (['whatsapp', 'sms', 'email'] as const).map((name) => {
    const channel = getChannel(name);
    return { name, provider: channel.provider, connected: channel.isConnected };
  }).concat([{ name: 'calendar' as never, provider: getCalendar().provider, connected: getCalendar().isConnected }]);
}

/** Deep link that works with zero integrations — the freelancer's real fallback. */
export function whatsappLink(phone: string, body: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(body)}`;
}
