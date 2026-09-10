import type { AppConfig } from '../config/index.js';
import type { NotificationRepository } from '../db/ports.js';
import { request } from '../providers/http.js';
import { errorMessage } from '../shared/errors.js';
import type { Logger } from '../shared/logger.js';
import { nullLogger } from '../shared/logger.js';
import type { NotificationEvent } from '../shared/types.js';

export interface NotificationMessage {
  event: NotificationEvent;
  title: string;
  body: string;
  /** Deep link back into the dashboard. */
  url?: string;
  /** Rendered as inline buttons where the channel supports them (Telegram). */
  actions?: Array<{ label: string; command: string }>;
  meta?: Record<string, unknown>;
}

export interface NotificationChannel {
  readonly kind: string;
  isConfigured(): boolean;
  send(target: string, message: NotificationMessage): Promise<void>;
}

/**
 * Notification abstraction (spec §48). The pipeline emits domain events; which channels
 * they reach is the user's configuration, not the pipeline's concern.
 */
export class Notifier {
  private readonly channels = new Map<string, NotificationChannel>();

  constructor(
    private readonly repo: NotificationRepository,
    private readonly logger: Logger = nullLogger,
  ) {}

  register(channel: NotificationChannel): this {
    this.channels.set(channel.kind, channel);
    return this;
  }

  available(): Array<{ kind: string; configured: boolean }> {
    return [...this.channels.values()].map((c) => ({ kind: c.kind, configured: c.isConfigured() }));
  }

  /** Delivery failures are logged, never propagated — a dead webhook must not fail a render. */
  async notify(userId: string, message: NotificationMessage): Promise<number> {
    const targets = await this.repo.listForEvent(userId, message.event);
    let delivered = 0;
    for (const target of targets) {
      const channel = this.channels.get(target.kind);
      if (!channel || !channel.isConfigured()) continue;
      try {
        await channel.send(target.target, message);
        delivered += 1;
      } catch (err) {
        this.logger.warn('notification delivery failed', {
          userId,
          kind: target.kind,
          event: message.event,
          error: errorMessage(err),
        });
      }
    }
    return delivered;
  }
}

/** Collects messages instead of sending them — used by tests and the offline run. */
export class MemoryNotificationChannel implements NotificationChannel {
  readonly kind = 'memory';
  readonly sent: Array<{ target: string; message: NotificationMessage }> = [];
  isConfigured(): boolean {
    return true;
  }
  async send(target: string, message: NotificationMessage): Promise<void> {
    this.sent.push({ target, message });
  }
}

export class TelegramChannel implements NotificationChannel {
  readonly kind = 'telegram';
  constructor(private readonly token: string) {}

  isConfigured(): boolean {
    return this.token.length > 0;
  }

  async send(chatId: string, message: NotificationMessage): Promise<void> {
    const keyboard = message.actions?.length
      ? {
          inline_keyboard: [
            message.actions.map((a) => ({ text: a.label, callback_data: a.command.slice(0, 64) })),
          ],
        }
      : undefined;

    await request('telegram', `https://api.telegram.org/bot${this.token}/sendMessage`, {
      body: {
        chat_id: chatId,
        text: `*${escapeMarkdown(message.title)}*\n\n${escapeMarkdown(message.body)}${
          message.url ? `\n\n${message.url}` : ''
        }`,
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
        ...(keyboard ? { reply_markup: keyboard } : {}),
      },
      timeoutMs: 15_000,
    });
  }
}

export class DiscordChannel implements NotificationChannel {
  readonly kind = 'discord';
  constructor(private readonly defaultWebhook?: string) {}

  isConfigured(): boolean {
    return true; // the target itself is the webhook URL
  }

  async send(target: string, message: NotificationMessage): Promise<void> {
    const url = target || this.defaultWebhook;
    if (!url) return;
    await request('discord', url, {
      body: {
        embeds: [
          {
            title: message.title,
            description: message.body.slice(0, 4000),
            url: message.url,
            color: colorFor(message.event),
          },
        ],
      },
      timeoutMs: 15_000,
    });
  }
}

export class SlackChannel implements NotificationChannel {
  readonly kind = 'slack';
  constructor(private readonly defaultWebhook?: string) {}

  isConfigured(): boolean {
    return true;
  }

  async send(target: string, message: NotificationMessage): Promise<void> {
    const url = target || this.defaultWebhook;
    if (!url) return;
    await request('slack', url, {
      body: {
        text: `*${message.title}*\n${message.body}${message.url ? `\n<${message.url}|Open in the dashboard>` : ''}`,
      },
      timeoutMs: 15_000,
    });
  }
}

/**
 * Email over a webhook-style SMTP relay URL. A real SMTP transport is a dependency this
 * system does not otherwise need, so email is delivered by POSTing to whatever relay the
 * operator configures in SMTP_URL — and the channel reports itself unconfigured until then,
 * rather than silently dropping mail.
 */
export class EmailChannel implements NotificationChannel {
  readonly kind = 'email';
  constructor(
    private readonly relayUrl: string | undefined,
    private readonly fromEmail: string,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.relayUrl);
  }

  async send(target: string, message: NotificationMessage): Promise<void> {
    if (!this.relayUrl) return;
    await request('email', this.relayUrl, {
      body: {
        from: this.fromEmail,
        to: target,
        subject: message.title,
        text: `${message.body}${message.url ? `\n\n${message.url}` : ''}`,
      },
      timeoutMs: 20_000,
    });
  }
}

export function buildNotifier(
  repo: NotificationRepository,
  config: AppConfig,
  logger: Logger = nullLogger,
): Notifier {
  const notifier = new Notifier(repo, logger);
  if (config.offline) {
    notifier.register(new MemoryNotificationChannel());
    return notifier;
  }
  notifier.register(new MemoryNotificationChannel());
  notifier.register(new TelegramChannel(config.providers.telegram.token.reveal()));
  notifier.register(new DiscordChannel(config.notifications.discordWebhookUrl));
  notifier.register(new SlackChannel(config.notifications.slackWebhookUrl));
  notifier.register(new EmailChannel(config.notifications.smtpUrl, config.notifications.fromEmail));
  return notifier;
}

function colorFor(event: NotificationEvent): number {
  if (event.includes('FAILED') || event === 'BUDGET_EXCEEDED') return 0xdc2626;
  if (event.includes('WARNING')) return 0xf59e0b;
  if (event === 'UPLOAD_SUCCESS') return 0x16a34a;
  return 0x2563eb;
}

/** MarkdownV2 requires every one of these to be escaped or the API rejects the message. */
function escapeMarkdown(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}
