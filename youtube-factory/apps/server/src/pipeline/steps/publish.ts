import { join } from 'node:path';
import type { PipelineStep, StepContext, StepResult } from '../context.js';
import { PipelineError, errorMessage } from '../../shared/errors.js';
import { AesGcmEncryptor } from '../../shared/crypto.js';
import { isPublishingProvider, type OAuthTokens, type PublishingProvider } from '../../providers/types.js';
import { formatChapter } from '../../shared/time.js';

/**
 * READY → SCHEDULED. Reserves a publishing slot, or stops for approval depending on the
 * channel's automation mode (spec §33, §47).
 */
export const scheduleStep: PipelineStep = {
  name: 'schedule',
  from: 'READY',
  running: 'READY',
  essential: true,

  async execute(ctx: StepContext): Promise<StepResult> {
    const qc = await ctx.repos.qc.latest(ctx.video.id);
    if (!qc?.passed) {
      throw new PipelineError('Refusing to schedule a video that has not passed quality control', undefined, false);
    }

    const costUsd = await ctx.repos.usage.sumForVideo(ctx.video.id);
    const thumbnails = await ctx.repos.thumbnails.listByVideo(ctx.video.id);
    const selected = thumbnails.find((t) => t.selected);

    const evaluation = await ctx.rules.evaluate(ctx.channel.id, {
      qcScore: qc.score,
      costUsd,
      factConfidence: ctx.video.factConfidence ?? 0,
      thumbnailScore: selected?.ctrPotential ?? 0,
      retentionScore: ctx.video.retentionScore ?? 0,
      qualityScore: ctx.video.qualityScore ?? 0,
    });

    const needsApproval =
      ctx.settings.automationMode !== 'FULL_AUTO' || evaluation.action?.type === 'requireApproval';

    if (needsApproval) {
      await notify(ctx, 'VIDEO_READY', `"${ctx.video.title}" is ready for approval`, {
        qcScore: qc.score,
        costUsd,
        rule: evaluation.reason,
      });
      return {
        status: 'READY',
        enqueueNext: false,
        waitingForApproval: true,
        note:
          evaluation.action?.type === 'requireApproval'
            ? evaluation.reason
            : `Channel is in ${ctx.settings.automationMode} mode — waiting for approval before scheduling.`,
      };
    }

    const assignment = await ctx.scheduler.reserve(ctx.channel.id, ctx.video.id);
    await ctx.repos.decisions.record({
      videoId: ctx.video.id,
      channelId: ctx.channel.id,
      subject: 'Publishing slot',
      decision: assignment.publishAt.toISOString(),
      reason: assignment.reason,
      score: null,
      dataUsed: { timezone: ctx.settings.timezone, publishDays: ctx.settings.publishDays },
    });

    return {
      status: 'SCHEDULED',
      patch: { publishAt: assignment.publishAt },
      // Nothing more happens until the slot arrives; the publish sweeper picks it up.
      enqueueNext: false,
      note: `Scheduled for ${assignment.publishAt.toISOString()}`,
    };
  },
};

/** SCHEDULED → PUBLISHED. Uploads to YouTube (spec §31, §32). */
export const uploadStep: PipelineStep = {
  name: 'upload',
  from: 'SCHEDULED',
  running: 'SCHEDULED',
  essential: true,

  async execute(ctx: StepContext): Promise<StepResult> {
    // ── upload safety (spec §32) ────────────────────────────────────────────
    const [qc, seo, thumbnails, assets] = await Promise.all([
      ctx.repos.qc.latest(ctx.video.id),
      ctx.repos.seo.findByVideo(ctx.video.id),
      ctx.repos.thumbnails.listByVideo(ctx.video.id),
      ctx.repos.assets.listByVideo(ctx.video.id),
    ]);
    const selected = thumbnails.find((t) => t.selected && t.storageKey);

    const blockers: string[] = [];
    if (!qc?.passed) blockers.push('quality control has not passed');
    if (!ctx.video.renderKey) blockers.push('there is no rendered file');
    if (!selected) blockers.push('no thumbnail is selected');
    if (!seo?.title) blockers.push('no title has been generated');
    if (!seo?.description) blockers.push('no description has been generated');
    if ((ctx.video.factConfidence ?? 0) < ctx.settings.minFactConfidence) {
      blockers.push(
        `fact confidence ${(((ctx.video.factConfidence ?? 0) * 100)).toFixed(0)}% is below the channel's ${(
          ctx.settings.minFactConfidence * 100
        ).toFixed(0)}% threshold`,
      );
    }
    const badLicence = assets.find((a) => a.license && !['owned', 'royalty_free', 'cc_by', 'cc0', 'licensed', 'generated'].includes(a.license.toLowerCase()));
    if (badLicence) blockers.push(`asset ${badLicence.id} has an unusable licence (${badLicence.license})`);

    if (blockers.length > 0) {
      await notify(ctx, 'UPLOAD_FAILED', `Upload blocked for "${ctx.video.title}"`, { blockers });
      return {
        status: 'FAILED',
        enqueueNext: false,
        patch: { failureReason: `Upload blocked: ${blockers.join('; ')}` },
        note: `Upload refused — ${blockers.join('; ')}`,
      };
    }

    const provider = ctx.registry.publishing();
    if (!provider) {
      throw new PipelineError('No publishing provider is configured', undefined, false);
    }

    const accessToken = await resolveAccessToken(ctx, provider);
    await ctx.repos.uploads.upsert(ctx.video.id, {
      state: 'UPLOADING',
      privacyStatus: ctx.settings.privacyStatus,
      youtubeVideoId: null,
      resumableUri: null,
      bytesUploaded: 0,
      error: null,
      startedAt: ctx.clock.now(),
      completedAt: null,
    });

    const localRender = await ctx.storage.localPath(ctx.video.renderKey!, join(ctx.workDir, 'upload'));
    const description = withChapters(seo!.description, seo!.chapters);

    // A slot in the future publishes privately and flips at the slot; a slot in the past
    // (a late render) publishes immediately at the channel's configured visibility.
    const now = ctx.clock.now();
    const scheduled = ctx.video.publishAt && ctx.video.publishAt > now ? ctx.video.publishAt : undefined;

    try {
      const result = await provider.upload(accessToken, {
        filePath: localRender,
        title: seo!.title.slice(0, 100),
        description,
        tags: seo!.tags,
        categoryId: seo!.categoryId,
        privacyStatus: scheduled ? 'private' : (ctx.settings.privacyStatus as 'private' | 'unlisted' | 'public'),
        publishAt: scheduled,
        language: ctx.settings.language,
        madeForKids: false,
        onProgress: (uploaded, total) => {
          void ctx.reportProgress(Math.round((uploaded / total) * 90));
          void ctx.repos.uploads.update(ctx.video.id, { bytesUploaded: uploaded });
        },
      });

      if (selected?.storageKey) {
        try {
          const image = await ctx.storage.get(selected.storageKey);
          await provider.setThumbnail(accessToken, result.videoId, image, 'image/jpeg');
        } catch (err) {
          // A thumbnail that fails to attach is worth a warning, not a failed publish.
          ctx.logger.warn('thumbnail upload failed', {
            videoId: ctx.video.id,
            error: errorMessage(err),
          });
        }
      }

      await ctx.repos.uploads.update(ctx.video.id, {
        state: 'COMPLETE',
        youtubeVideoId: result.videoId,
        completedAt: ctx.clock.now(),
      });

      await notify(ctx, 'UPLOAD_SUCCESS', `Published "${seo!.title}"`, {
        youtubeVideoId: result.videoId,
        publishAt: scheduled?.toISOString(),
      });

      await ctx.reportProgress(100);
      return {
        status: 'PUBLISHED',
        patch: {
          youtubeVideoId: result.videoId,
          publishedAt: scheduled ?? now,
        },
        // Analytics are collected later, once there is something to measure.
        enqueueNext: true,
        delayMs: 24 * 3600_000,
        note: scheduled
          ? `Uploaded privately, scheduled to go live at ${scheduled.toISOString()}`
          : `Published as ${ctx.settings.privacyStatus}`,
      };
    } catch (err) {
      await ctx.repos.uploads.update(ctx.video.id, {
        state: 'FAILED',
        error: errorMessage(err).slice(0, 500),
      });
      await notify(ctx, 'UPLOAD_FAILED', `Upload failed for "${ctx.video.title}"`, {
        error: errorMessage(err),
      });
      throw err;
    }
  },
};

/** PUBLISHED → PUBLISHED (via ANALYZING). Collects metrics and learns (spec §34, §35). */
export const analyticsStep: PipelineStep = {
  name: 'analytics',
  from: 'PUBLISHED',
  running: 'ANALYZING',
  essential: true,

  async execute(ctx: StepContext): Promise<StepResult> {
    if (!ctx.video.youtubeVideoId || !ctx.channel.youtubeChannelId) {
      return { status: 'PUBLISHED', enqueueNext: false, note: 'Not published to a connected channel — nothing to collect.' };
    }

    const provider = ctx.registry.publishing();
    if (!provider) return { status: 'PUBLISHED', enqueueNext: false, note: 'No publishing provider configured.' };

    const accessToken = await resolveAccessToken(ctx, provider);
    const since = ctx.video.publishedAt ?? new Date(ctx.clock.now().getTime() - 30 * 86_400_000);
    const metrics = await provider.getMetrics(accessToken, ctx.channel.youtubeChannelId, ctx.video.youtubeVideoId, since);

    const snapshot = await ctx.repos.analytics.create({
      videoId: ctx.video.id,
      capturedAt: ctx.clock.now(),
      views: metrics.views,
      watchTimeMinutes: metrics.watchTimeMinutes,
      averageViewDuration: metrics.averageViewDuration,
      averageViewPercentage: metrics.averageViewPercentage,
      impressions: metrics.impressions,
      ctr: metrics.ctr,
      likes: metrics.likes,
      comments: metrics.comments,
      shares: metrics.shares,
      subscribersGained: metrics.subscribersGained,
      estimatedRevenueUsd: metrics.estimatedRevenueUsd ?? null,
      raw: metrics.raw ?? null,
    });

    ctx.logger.info('analytics collected', {
      videoId: ctx.video.id,
      views: snapshot.views,
      ctr: snapshot.ctr,
    });

    // Keep polling for the first month, with widening gaps — early numbers move fast.
    const age = ctx.clock.now().getTime() - (ctx.video.publishedAt?.getTime() ?? ctx.clock.now().getTime());
    const days = age / 86_400_000;
    const nextDelay = days < 2 ? 12 * 3600_000 : days < 8 ? 2 * 86_400_000 : days < 30 ? 7 * 86_400_000 : null;

    return {
      status: 'PUBLISHED',
      enqueueNext: nextDelay !== null,
      delayMs: nextDelay ?? undefined,
      note: `${snapshot.views} views, ${snapshot.ctr}% CTR, ${snapshot.averageViewPercentage}% average viewed`,
    };
  },
};

/**
 * Returns a valid access token, refreshing and re-encrypting it when it is close to
 * expiry. Tokens are only ever decrypted in memory here (spec §46).
 */
export async function resolveAccessToken(ctx: StepContext, provider: PublishingProvider): Promise<string> {
  const account = await ctx.repos.oauth.findByChannel(ctx.channel.id);
  if (!account) {
    throw new PipelineError(
      `Channel "${ctx.channel.name}" is not connected to ${provider.name}. Connect it on the Channels screen.`,
      undefined,
      false,
    );
  }
  const encryptor = new AesGcmEncryptor(ctx.config.security.encryptionKey);
  const accessToken = encryptor.decrypt(account.accessToken);

  const expiresSoon = account.expiresAt.getTime() - ctx.clock.now().getTime() < 120_000;
  if (!expiresSoon) return accessToken;

  if (!account.refreshToken) {
    throw new PipelineError(
      `The connection for "${ctx.channel.name}" has expired and no refresh token is stored. Reconnect the channel.`,
      undefined,
      false,
    );
  }

  const refreshed: OAuthTokens = await provider.refresh(encryptor.decrypt(account.refreshToken));
  await ctx.repos.oauth.upsert({
    channelId: ctx.channel.id,
    provider: account.provider,
    externalAccountId: account.externalAccountId,
    accessToken: encryptor.encrypt(refreshed.accessToken),
    refreshToken: encryptor.encrypt(refreshed.refreshToken ?? encryptor.decrypt(account.refreshToken)),
    scope: refreshed.scope,
    tokenType: refreshed.tokenType,
    expiresAt: refreshed.expiresAt,
  });
  return refreshed.accessToken;
}

export function withChapters(description: string, chapters: Array<{ startSec: number; title: string }>): string {
  if (chapters.length === 0 || description.includes('0:00')) return description.slice(0, 5000);
  const block = chapters.map((c) => `${formatChapter(c.startSec)} ${c.title}`).join('\n');
  return `${description}\n\nChapters:\n${block}`.slice(0, 5000);
}

async function notify(
  ctx: StepContext,
  event: 'VIDEO_READY' | 'UPLOAD_SUCCESS' | 'UPLOAD_FAILED',
  title: string,
  meta: Record<string, unknown>,
): Promise<void> {
  const channel = await ctx.repos.channels.findById(ctx.channel.id);
  if (!channel) return;
  await ctx.notifier.notify(channel.userId, {
    event,
    title,
    body: `Channel: ${ctx.channel.name}`,
    url: `${ctx.config.http.appUrl}/videos/${ctx.video.id}`,
    actions:
      event === 'VIDEO_READY'
        ? [
            { label: 'Approve', command: `approve:${ctx.video.id}` },
            { label: 'Reject', command: `reject:${ctx.video.id}` },
          ]
        : undefined,
    meta,
  });
}

export { isPublishingProvider };
