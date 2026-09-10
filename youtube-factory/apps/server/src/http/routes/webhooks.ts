import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../../services/container.js';
import { constantTimeEquals, verifySignature } from '../../shared/crypto.js';
import { ForbiddenError } from '../../shared/errors.js';
import { PIPELINE_STAGES } from '../../pipeline/state-machine.js';

/**
 * Inbound webhooks (spec §66). Provider callbacks let us stop polling a long generation;
 * every one is authenticated, either by an HMAC signature over the raw body or by the
 * secret token the vendor echoes back.
 */
export async function webhookRoutes(app: FastifyInstance, services: AppServices): Promise<void> {
  /**
   * Higgsfield delivers to the URL passed as `?hf_webhook=`. We add our own signed token to
   * that URL, and check it here — the vendor's payload alone is not proof of origin.
   */
  app.post('/api/webhooks/higgsfield', async (request, reply) => {
    const query = z.object({ token: z.string().optional(), ts: z.coerce.number().optional() }).parse(request.query);
    if (!query.token || !query.ts) throw new ForbiddenError('Missing webhook token');

    const raw = typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});
    const valid = verifySignature(
      services.config.security.webhookSecret,
      'higgsfield',
      query.ts,
      query.token,
      // Generation webhooks can arrive long after the request was made.
      86_400,
      services.clock.now().getTime(),
    );
    if (!valid) throw new ForbiddenError('Invalid webhook token');

    const body = z
      .object({
        request_id: z.string().optional(),
        status: z.string().optional(),
        video: z.object({ url: z.string() }).optional(),
        images: z.array(z.object({ url: z.string() })).optional(),
      })
      .passthrough()
      .parse(JSON.parse(raw || '{}'));

    services.logger.info('higgsfield webhook received', {
      provider: 'higgsfield',
      requestId: body.request_id,
      status: body.status,
    });

    // The generation step polls as its primary path; the webhook is an accelerator, so an
    // unknown request id is not an error.
    return reply.status(202).send({ received: true });
  });

  /**
   * Generic signed webhook: `x-ycf-timestamp` + `x-ycf-signature` over `timestamp.body`.
   * Used by external schedulers to trigger the autopilot and the publish sweeper without a
   * session cookie.
   */
  app.post('/api/webhooks/trigger', async (request, reply) => {
    const timestamp = Number(request.headers['x-ycf-timestamp']);
    const signature = String(request.headers['x-ycf-signature'] ?? '');
    const raw = typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});

    if (!Number.isFinite(timestamp) || !signature) throw new ForbiddenError('Missing signature headers');
    if (!verifySignature(services.config.security.webhookSecret, raw, timestamp, signature, 300, services.clock.now().getTime())) {
      throw new ForbiddenError('Invalid signature');
    }

    const body = z
      .object({ action: z.enum(['autopilot', 'publish-due', 'analytics', 'strategy']), channelId: z.string().optional() })
      .parse(JSON.parse(raw || '{}'));

    switch (body.action) {
      case 'autopilot': {
        const results = body.channelId
          ? [await services.autopilot.runForChannel(body.channelId)]
          : await services.autopilot.runAll();
        return { results };
      }
      case 'publish-due':
        return { queued: await services.autopilot.publishDue() };
      case 'strategy': {
        if (!body.channelId) return reply.status(400).send({ error: { code: 'validation_error', message: 'channelId is required' } });
        return { plan: await services.autopilot.runWeeklyStrategy(body.channelId) };
      }
      case 'analytics': {
        const videos = await services.repos.videos.listByStatus('PUBLISHED', 50);
        const queued: string[] = [];
        for (const video of videos) {
          await services.runner.enqueue(video.id, { reason: 'scheduled analytics', expectStatus: 'PUBLISHED' });
          queued.push(video.id);
        }
        return { queued };
      }
      default:
        return reply.status(400).send({ error: { code: 'validation_error', message: 'Unknown action' } });
    }
  });

  /**
   * Telegram bot (spec §49). Telegram authenticates its own deliveries with a secret token
   * header that we set when registering the webhook.
   */
  app.post('/api/webhooks/telegram', async (request, reply) => {
    const expected = services.config.providers.telegram.webhookSecret;
    if (expected.present) {
      const given = String(request.headers['x-telegram-bot-api-secret-token'] ?? '');
      if (!constantTimeEquals(given, expected.reveal())) throw new ForbiddenError('Invalid Telegram secret token');
    }

    const update = z
      .object({
        message: z
          .object({
            chat: z.object({ id: z.union([z.number(), z.string()]) }),
            text: z.string().optional(),
          })
          .optional(),
        callback_query: z
          .object({
            data: z.string().optional(),
            message: z.object({ chat: z.object({ id: z.union([z.number(), z.string()]) }) }).optional(),
          })
          .optional(),
      })
      .passthrough()
      .parse(request.body ?? {});

    const chatId = String(update.message?.chat.id ?? update.callback_query?.message?.chat.id ?? '');
    const text = update.callback_query?.data ?? update.message?.text ?? '';
    if (!chatId || !text) return reply.status(200).send({ ok: true });

    const reply_text = await handleTelegramCommand(services, chatId, text.trim());
    if (reply_text) {
      await services.notifier.notify(await resolveUserForChat(services, chatId), {
        event: 'WEEKLY_REPORT',
        title: 'Content Factory',
        body: reply_text,
      });
    }
    return { ok: true };
  });
}

/**
 * Telegram command handling. A chat is only ever acted upon when it is already registered
 * as a notification target for a user — an unknown chat gets instructions, never data.
 */
export async function handleTelegramCommand(services: AppServices, chatId: string, text: string): Promise<string> {
  const target = await services.repos.notifications.findByKindTarget('telegram', chatId);
  if (!target) {
    return `This chat is not linked to an account yet.\n\nAdd ${chatId} as a Telegram notification target on the Settings screen, then send /status again.`;
  }

  const userId = target.userId;
  const channels = await services.repos.channels.listByUser(userId);
  const [command, ...args] = text.replace(/^\//, '').split(/[\s:]+/);

  switch ((command ?? '').toLowerCase()) {
    case 'status': {
      const lines: string[] = [];
      for (const channel of channels) {
        const counts = await services.repos.videos.countByStatus(channel.id);
        const active = PIPELINE_STAGES.filter((s) => !['PUBLISHED', 'ANALYZING'].includes(s.status))
          .map((s) => counts[s.status] ?? 0)
          .reduce((a, b) => a + b, 0);
        const budget = await services.budget.status(channel.id);
        lines.push(
          `${channel.name}: ${active} in production, ${counts.SCHEDULED ?? 0} scheduled, ${counts.PUBLISHED ?? 0} published. Budget ${Math.round(budget.utilisation * 100)}% used.`,
        );
      }
      return lines.join('\n') || 'No channels yet.';
    }
    case 'videos': {
      const channel = channels[0];
      if (!channel) return 'No channels yet.';
      const page = await services.repos.videos.listByChannel(channel.id, { limit: 10 });
      return page.items.map((v) => `${v.status.padEnd(20)} ${v.title}`).join('\n') || 'No videos yet.';
    }
    case 'ideas': {
      const channel = channels[0];
      if (!channel) return 'No channels yet.';
      const ideas = await services.repos.ideas.listByChannel(channel.id, { status: 'PROPOSED', limit: 5 });
      return ideas.map((i) => `[${i.overallScore}] ${i.title}\n  /approve ${i.id}`).join('\n\n') || 'No ideas waiting.';
    }
    case 'approve': {
      const id = args[0];
      if (!id) return 'Usage: /approve <ideaId or videoId>';
      const idea = await services.repos.ideas.findById(id);
      if (idea && channels.some((c) => c.id === idea.channelId)) {
        await services.repos.ideas.update(id, { status: 'APPROVED' });
        return `Approved idea "${idea.title}".`;
      }
      const video = await services.repos.videos.findById(id);
      if (video && channels.some((c) => c.id === video.channelId)) {
        await services.production.approve(id);
        return `Approved "${video.title}" — production continues.`;
      }
      return 'Nothing found with that id on your channels.';
    }
    case 'reject': {
      const id = args[0];
      if (!id) return 'Usage: /reject <ideaId or videoId>';
      const idea = await services.repos.ideas.findById(id);
      if (idea && channels.some((c) => c.id === idea.channelId)) {
        await services.repos.ideas.update(id, { status: 'REJECTED' });
        return `Rejected idea "${idea.title}".`;
      }
      const video = await services.repos.videos.findById(id);
      if (video && channels.some((c) => c.id === video.channelId)) {
        await services.production.reject(id, 'Rejected from Telegram');
        return `Rejected "${video.title}".`;
      }
      return 'Nothing found with that id on your channels.';
    }
    case 'schedule': {
      const channel = channels[0];
      if (!channel) return 'No channels yet.';
      const slots = await services.scheduler.upcomingSlots(channel.id, 5);
      return slots.map((s) => s.toISOString()).join('\n');
    }
    case 'cost': {
      const lines: string[] = [];
      for (const channel of channels) {
        const budget = await services.budget.status(channel.id);
        lines.push(
          `${channel.name}: $${budget.spentUsd.toFixed(2)} of $${budget.budgetUsd.toFixed(2)} this month (projected $${budget.projectedMonthEndUsd.toFixed(2)}).`,
        );
      }
      return lines.join('\n') || 'No channels yet.';
    }
    default:
      return 'Commands: /status /videos /ideas /approve <id> /reject <id> /schedule /cost';
  }
}

async function resolveUserForChat(services: AppServices, chatId: string): Promise<string> {
  const target = await services.repos.notifications.findByKindTarget('telegram', chatId);
  return target?.userId ?? '';
}
