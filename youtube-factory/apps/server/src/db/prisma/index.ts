import type { PrismaClient, Prisma } from '@prisma/client';
import { prismaClient, disconnectPrisma, fromBigInt, toBigInt } from './client.js';
import type * as P from '../ports.js';
import type * as R from '../types.js';
import { ConflictError, NotFoundError } from '../../shared/errors.js';
import type { IdeaStatus, JobState, VideoStatus } from '../../shared/types.js';

/**
 * PostgreSQL implementation of the repository ports. All access is through Prisma's
 * parameterised query builder — there is no raw SQL anywhere in this file (spec §46).
 *
 * The mapping layer exists because the domain records are plain data: BigInt columns become
 * numbers, `Json` columns become typed structures, and Prisma's enums become our string
 * unions. That keeps `@prisma/client` out of every other layer.
 */
export class PrismaRepositories implements P.Repositories {
  private readonly db: PrismaClient;

  constructor(databaseUrl?: string, client?: PrismaClient) {
    this.db = client ?? prismaClient(databaseUrl);
  }

  async close(): Promise<void> {
    await disconnectPrisma();
  }

  // ── users / sessions ───────────────────────────────────────────────────────

  readonly users: P.UserRepository = {
    create: async (data) => {
      try {
        return mapUser(
          await this.db.user.create({
            data: {
              email: data.email.toLowerCase(),
              passwordHash: data.passwordHash,
              name: data.name ?? null,
              role: data.role,
            },
          }),
        );
      } catch (err) {
        if (isUniqueViolation(err)) throw new ConflictError('An account with that email already exists');
        throw err;
      }
    },
    findById: async (id) => nullable(await this.db.user.findUnique({ where: { id } }), mapUser),
    findByEmail: async (email) =>
      nullable(await this.db.user.findUnique({ where: { email: email.toLowerCase() } }), mapUser),
    update: async (id, patch) =>
      mapUser(
        await this.db.user.update({
          where: { id },
          data: { name: patch.name, role: patch.role, passwordHash: patch.passwordHash },
        }),
      ),
    count: async () => this.db.user.count(),
    list: async (limit = 100) =>
      (await this.db.user.findMany({ orderBy: { createdAt: 'desc' }, take: limit })).map(mapUser),
  };

  readonly sessions: P.SessionRepository = {
    create: async (data) =>
      mapSession(
        await this.db.session.create({
          data: {
            userId: data.userId,
            tokenHash: data.tokenHash,
            userAgent: data.userAgent ?? null,
            ip: data.ip ?? null,
            expiresAt: data.expiresAt,
          },
        }),
      ),
    findByTokenHash: async (hash) =>
      nullable(await this.db.session.findUnique({ where: { tokenHash: hash } }), mapSession),
    revoke: async (id, at) => {
      await this.db.session.update({ where: { id }, data: { revokedAt: at } });
    },
    revokeAllForUser: async (userId, at) => {
      await this.db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: at } });
    },
    deleteExpired: async (before) =>
      (await this.db.session.deleteMany({ where: { expiresAt: { lt: before } } })).count,
  };

  // ── channels ───────────────────────────────────────────────────────────────

  readonly channels: P.ChannelRepository = {
    create: async (data) =>
      mapChannel(
        await this.db.channel.create({
          data: {
            userId: data.userId,
            platform: data.platform,
            youtubeChannelId: data.youtubeChannelId ?? null,
            name: data.name,
            description: data.description ?? null,
            thumbnailUrl: data.thumbnailUrl ?? null,
            subscriberCount: data.subscriberCount ?? null,
            videoCount: data.videoCount ?? null,
            viewCount: toBigInt(data.viewCount),
            enabled: data.enabled,
            isDefault: data.isDefault,
          },
        }),
      ),
    findById: async (id) => nullable(await this.db.channel.findUnique({ where: { id } }), mapChannel),
    findByYoutubeId: async (userId, youtubeChannelId) =>
      nullable(
        await this.db.channel.findFirst({ where: { userId, youtubeChannelId } }),
        mapChannel,
      ),
    listByUser: async (userId) =>
      (await this.db.channel.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })).map(mapChannel),
    listEnabled: async () => (await this.db.channel.findMany({ where: { enabled: true } })).map(mapChannel),
    update: async (id, patch) =>
      mapChannel(
        await this.db.channel.update({
          where: { id },
          data: {
            name: patch.name,
            description: patch.description,
            thumbnailUrl: patch.thumbnailUrl,
            youtubeChannelId: patch.youtubeChannelId,
            subscriberCount: patch.subscriberCount,
            videoCount: patch.videoCount,
            viewCount: patch.viewCount === undefined ? undefined : toBigInt(patch.viewCount),
            statsFetchedAt: patch.statsFetchedAt,
            enabled: patch.enabled,
            isDefault: patch.isDefault,
          },
        }),
      ),
    delete: async (id) => {
      await this.db.channel.delete({ where: { id } });
    },
    clearDefault: async (userId) => {
      await this.db.channel.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    },
    count: async () => this.db.channel.count(),
  };

  readonly channelSettings: P.ChannelSettingsRepository = {
    upsert: async (channelId, data) => {
      const payload = settingsPayload(data);
      return mapSettings(
        await this.db.channelSettings.upsert({
          where: { channelId },
          create: { channelId, ...payload } as Prisma.ChannelSettingsUncheckedCreateInput,
          update: payload,
        }),
      );
    },
    findByChannel: async (channelId) =>
      nullable(await this.db.channelSettings.findUnique({ where: { channelId } }), mapSettings),
    update: async (channelId, patch) =>
      mapSettings(
        await this.db.channelSettings.update({ where: { channelId }, data: settingsPayload(patch) }),
      ),
  };

  readonly oauth: P.OAuthRepository = {
    upsert: async (data) => {
      const payload = {
        provider: data.provider,
        externalAccountId: data.externalAccountId ?? null,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken ?? null,
        scope: data.scope,
        tokenType: data.tokenType,
        expiresAt: data.expiresAt,
      };
      return mapOAuth(
        await this.db.oAuthAccount.upsert({
          where: { channelId: data.channelId },
          create: { channelId: data.channelId, ...payload },
          update: payload,
        }),
      );
    },
    findByChannel: async (channelId) =>
      nullable(await this.db.oAuthAccount.findUnique({ where: { channelId } }), mapOAuth),
    deleteByChannel: async (channelId) => {
      await this.db.oAuthAccount.deleteMany({ where: { channelId } });
    },
  };

  readonly competitors: P.CompetitorRepository = {
    create: async (data) => {
      try {
        return mapCompetitor(
          await this.db.competitorChannel.create({
            data: {
              channelId: data.channelId,
              youtubeChannelId: data.youtubeChannelId,
              name: data.name,
              subscriberCount: data.subscriberCount ?? null,
              uploadFrequency: data.uploadFrequency ?? null,
              avgViews: data.avgViews ?? null,
              avgDurationSec: data.avgDurationSec ?? null,
              snapshot: json(data.snapshot),
            },
          }),
        );
      } catch (err) {
        if (isUniqueViolation(err)) throw new ConflictError('That competitor is already tracked for this channel');
        throw err;
      }
    },
    listByChannel: async (channelId) =>
      (await this.db.competitorChannel.findMany({ where: { channelId } })).map(mapCompetitor),
    update: async (id, patch) =>
      mapCompetitor(
        await this.db.competitorChannel.update({
          where: { id },
          data: {
            name: patch.name,
            subscriberCount: patch.subscriberCount,
            uploadFrequency: patch.uploadFrequency,
            avgViews: patch.avgViews,
            avgDurationSec: patch.avgDurationSec,
            lastAnalyzedAt: patch.lastAnalyzedAt,
            snapshot: patch.snapshot === undefined ? undefined : json(patch.snapshot),
          },
        }),
      ),
    delete: async (id) => {
      await this.db.competitorChannel.delete({ where: { id } });
    },
  };

  readonly discovery: P.DiscoveryRepository = {
    createSource: async (data) =>
      mapSource(
        await this.db.discoverySource.create({
          data: {
            channelId: data.channelId,
            kind: data.kind,
            label: data.label,
            target: data.target,
            enabled: data.enabled,
          },
        }),
      ),
    listSources: async (channelId) =>
      (await this.db.discoverySource.findMany({ where: { channelId } })).map(mapSource),
    updateSource: async (id, patch) =>
      mapSource(
        await this.db.discoverySource.update({
          where: { id },
          data: { label: patch.label, target: patch.target, enabled: patch.enabled, lastRunAt: patch.lastRunAt },
        }),
      ),
    deleteSource: async (id) => {
      await this.db.discoverySource.delete({ where: { id } });
    },
    recordSignals: async (signals) => {
      if (signals.length === 0) return [];
      const created = await this.db.$transaction(
        signals.map((s) =>
          this.db.trendSignal.create({
            data: {
              sourceId: s.sourceId,
              kind: s.kind,
              topic: s.topic,
              url: s.url ?? null,
              score: s.score,
              velocity: s.velocity ?? null,
              raw: json(s.raw),
              ...(s.observedAt ? { observedAt: s.observedAt } : {}),
            },
          }),
        ),
      );
      // channelId is denormalised on the domain record; recover it from the source.
      const sourceIds = [...new Set(created.map((c) => c.sourceId))];
      const sources = await this.db.discoverySource.findMany({ where: { id: { in: sourceIds } } });
      const channelBySource = new Map(sources.map((s) => [s.id, s.channelId]));
      return created.map((c) => mapSignal(c, channelBySource.get(c.sourceId) ?? ''));
    },
    recentSignals: async (channelId, since, limit = 100) => {
      const rows = await this.db.trendSignal.findMany({
        where: { observedAt: { gte: since }, source: { channelId } },
        orderBy: { score: 'desc' },
        take: limit,
      });
      return rows.map((r) => mapSignal(r, channelId));
    },
  };

  // ── ideas ──────────────────────────────────────────────────────────────────

  readonly ideas: P.IdeaRepository = {
    createMany: async (data) => {
      if (data.length === 0) return [];
      const created = await this.db.$transaction(
        data.map((d) =>
          this.db.contentIdea.create({
            data: {
              channelId: d.channelId,
              title: d.title,
              topic: d.topic,
              angle: d.angle,
              hook: d.hook,
              targetAudience: d.targetAudience,
              rationale: d.rationale ?? null,
              status: d.status,
              estimatedDemand: d.estimatedDemand,
              competition: d.competition,
              novelty: d.novelty,
              evergreenScore: d.evergreenScore,
              trendScore: d.trendScore,
              productionCostUsd: d.productionCostUsd,
              estimatedCtr: d.estimatedCtr,
              estimatedRetention: d.estimatedRetention,
              overallScore: d.overallScore,
              scoreBreakdown: json(d.scoreBreakdown),
              sourceSignals: json(d.sourceSignals),
            },
          }),
        ),
      );
      return created.map(mapIdea);
    },
    findById: async (id) => nullable(await this.db.contentIdea.findUnique({ where: { id } }), mapIdea),
    listByChannel: async (channelId, filter = {}) =>
      (
        await this.db.contentIdea.findMany({
          where: { channelId, ...(filter.status ? { status: filter.status } : {}) },
          orderBy: { overallScore: 'desc' },
          take: filter.limit,
        })
      ).map(mapIdea),
    update: async (id, patch) =>
      mapIdea(
        await this.db.contentIdea.update({
          where: { id },
          data: {
            status: patch.status,
            title: patch.title,
            topic: patch.topic,
            angle: patch.angle,
            hook: patch.hook,
            overallScore: patch.overallScore,
            scoreBreakdown: patch.scoreBreakdown === undefined ? undefined : json(patch.scoreBreakdown),
          },
        }),
      ),
    delete: async (id) => {
      await this.db.contentIdea.delete({ where: { id } });
    },
    bestCandidate: async (channelId, minScore, allowProposed) => {
      const statuses: IdeaStatus[] = allowProposed ? ['APPROVED', 'PROPOSED'] : ['APPROVED'];
      return nullable(
        await this.db.contentIdea.findFirst({
          where: { channelId, status: { in: statuses }, overallScore: { gte: minScore } },
          orderBy: { overallScore: 'desc' },
        }),
        mapIdea,
      );
    },
  };

  // ── videos ─────────────────────────────────────────────────────────────────

  readonly videos: P.VideoRepository = {
    create: async (data) =>
      mapVideo(
        await this.db.video.create({
          data: {
            channelId: data.channelId,
            ideaId: data.ideaId ?? null,
            templateId: data.templateId ?? null,
            title: data.title,
            status: data.status,
            progress: json(data.progress),
            targetDurationSec: data.targetDurationSec,
            language: data.language,
            estimatedCostUsd: data.estimatedCostUsd,
            actualCostUsd: data.actualCostUsd,
          },
        }),
      ),
    findById: async (id) => nullable(await this.db.video.findUnique({ where: { id } }), mapVideo),
    update: async (id, patch) =>
      mapVideo(
        await this.db.video.update({
          where: { id },
          data: {
            title: patch.title,
            status: patch.status,
            previousStatus: patch.previousStatus,
            progress: patch.progress === undefined ? undefined : json(patch.progress),
            targetDurationSec: patch.targetDurationSec,
            actualDurationSec: patch.actualDurationSec,
            renderKey: patch.renderKey,
            renderWidth: patch.renderWidth,
            renderHeight: patch.renderHeight,
            fileSizeBytes: patch.fileSizeBytes === undefined ? undefined : toBigInt(patch.fileSizeBytes),
            qualityScore: patch.qualityScore,
            qualityBreakdown: patch.qualityBreakdown === undefined ? undefined : json(patch.qualityBreakdown),
            factConfidence: patch.factConfidence,
            retentionScore: patch.retentionScore,
            estimatedCostUsd: patch.estimatedCostUsd,
            actualCostUsd: patch.actualCostUsd,
            failureReason: patch.failureReason,
            publishAt: patch.publishAt,
            publishedAt: patch.publishedAt,
            youtubeVideoId: patch.youtubeVideoId,
            ideaId: patch.ideaId,
          },
        }),
      ),
    delete: async (id) => {
      await this.db.video.delete({ where: { id } });
    },
    listByChannel: async (channelId, filter = {}) => {
      const where = {
        channelId,
        ...(filter.status ? { status: { in: ([] as VideoStatus[]).concat(filter.status) } } : {}),
      };
      const [items, total] = await Promise.all([
        this.db.video.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: filter.limit,
          skip: filter.offset,
        }),
        this.db.video.count({ where }),
      ]);
      return { items: items.map(mapVideo), total };
    },
    listByStatus: async (status, limit = 100) =>
      (
        await this.db.video.findMany({
          where: { status: { in: ([] as VideoStatus[]).concat(status) } },
          orderBy: { updatedAt: 'asc' },
          take: limit,
        })
      ).map(mapVideo),
    listDueForPublish: async (now, limit = 50) =>
      (
        await this.db.video.findMany({
          where: { status: 'SCHEDULED', publishAt: { lte: now } },
          orderBy: { publishAt: 'asc' },
          take: limit,
        })
      ).map(mapVideo),
    listPublishedSince: async (channelId, since) =>
      (
        await this.db.video.findMany({
          where: { channelId, publishedAt: { gte: since } },
          orderBy: { publishedAt: 'desc' },
        })
      ).map(mapVideo),
    countByStatus: async (channelId) => {
      const rows = await this.db.video.groupBy({
        by: ['status'],
        where: { channelId },
        _count: { _all: true },
      });
      return Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
    },
    count: async () => this.db.video.count(),
  };

  // ── production artefacts ───────────────────────────────────────────────────

  readonly research: P.ResearchRepository = {
    upsert: async (videoId, data, sources) => {
      const payload = {
        topic: data.topic,
        summary: data.summary,
        depth: data.depth,
        confidence: data.confidence,
        openQuestions: json(data.openQuestions),
      };
      const record = await this.db.$transaction(async (tx) => {
        const existing = await tx.research.findUnique({ where: { videoId } });
        if (existing) await tx.researchSource.deleteMany({ where: { researchId: existing.id } });
        const saved = existing
          ? await tx.research.update({ where: { videoId }, data: payload })
          : await tx.research.create({ data: { videoId, ...payload } });
        if (sources.length) {
          await tx.researchSource.createMany({
            data: sources.map((s) => ({
              researchId: saved.id,
              claim: s.claim,
              source: s.source,
              sourceUrl: s.sourceUrl ?? null,
              sourceType: s.sourceType,
              publishedAt: s.publishedAt ?? null,
              confidence: s.confidence,
              verdict: s.verdict,
              notes: s.notes ?? null,
            })),
          });
        }
        return saved;
      });
      return mapResearch(record);
    },
    findByVideo: async (videoId) => {
      const record = await this.db.research.findUnique({ where: { videoId }, include: { sources: true } });
      if (!record) return null;
      return { ...mapResearch(record), sources: record.sources.map(mapResearchSource) };
    },
    updateSourceVerdicts: async (researchId, updates) => {
      await this.db.$transaction(
        updates.map((u) =>
          this.db.researchSource.updateMany({
            where: { researchId, claim: u.claim },
            data: { verdict: u.verdict, confidence: u.confidence },
          }),
        ),
      );
    },
  };

  readonly scripts: P.ScriptRepository = {
    upsert: async (videoId, data) => {
      const payload = {
        structure: data.structure,
        hook: data.hook,
        intro: data.intro,
        sections: json(data.sections) as Prisma.InputJsonValue,
        cta: data.cta,
        wordCount: data.wordCount,
        estimatedDuration: data.estimatedDuration,
        retentionScore: data.retentionScore ?? null,
        retentionNotes: json(data.retentionNotes),
        factCheckScore: data.factCheckScore ?? null,
        factCheckReport: json(data.factCheckReport),
      };
      const existing = await this.db.script.findUnique({ where: { videoId } });
      const saved = existing
        ? await this.db.script.update({
            where: { videoId },
            data: { ...payload, revision: existing.revision + 1 },
          })
        : await this.db.script.create({ data: { videoId, ...payload } });
      return mapScript(saved);
    },
    findByVideo: async (videoId) => nullable(await this.db.script.findUnique({ where: { videoId } }), mapScript),
    update: async (videoId, patch) =>
      mapScript(
        await this.db.script.update({
          where: { videoId },
          data: {
            retentionScore: patch.retentionScore,
            retentionNotes: patch.retentionNotes === undefined ? undefined : json(patch.retentionNotes),
            factCheckScore: patch.factCheckScore,
            factCheckReport: patch.factCheckReport === undefined ? undefined : json(patch.factCheckReport),
            sections: patch.sections === undefined ? undefined : (json(patch.sections) as Prisma.InputJsonValue),
            hook: patch.hook,
            intro: patch.intro,
            cta: patch.cta,
            wordCount: patch.wordCount,
            estimatedDuration: patch.estimatedDuration,
          },
        }),
      ),
  };

  readonly scenes: P.SceneRepository = {
    replaceAll: async (videoId, scenes) => {
      await this.db.$transaction(async (tx) => {
        await tx.scene.deleteMany({ where: { videoId } });
        if (scenes.length) {
          await tx.scene.createMany({
            data: scenes.map((s) => ({
              videoId,
              index: s.index,
              durationSec: s.durationSec,
              narration: s.narration,
              visualBrief: s.visualBrief,
              prompt: s.prompt,
              negativePrompt: s.negativePrompt ?? null,
              camera: s.camera ?? null,
              style: s.style ?? null,
              aspectRatio: s.aspectRatio,
              characters: s.characters,
              location: s.location ?? null,
              lighting: s.lighting ?? null,
              motion: s.motion ?? null,
              continuityNotes: s.continuityNotes ?? null,
              textOverlay: s.textOverlay ?? null,
              sfx: s.sfx ?? null,
              importance: s.importance,
              strategy: s.strategy,
              assetId: s.assetId ?? null,
            })),
          });
        }
      });
      return (await this.db.scene.findMany({ where: { videoId }, orderBy: { index: 'asc' } })).map(mapScene);
    },
    listByVideo: async (videoId) =>
      (await this.db.scene.findMany({ where: { videoId }, orderBy: { index: 'asc' } })).map(mapScene),
    update: async (id, patch) =>
      mapScene(
        await this.db.scene.update({
          where: { id },
          data: {
            strategy: patch.strategy,
            assetId: patch.assetId,
            prompt: patch.prompt,
            negativePrompt: patch.negativePrompt,
            motion: patch.motion,
            durationSec: patch.durationSec,
          },
        }),
      ),
  };

  readonly assets: P.AssetRepository = {
    create: async (data) =>
      mapAsset(
        await this.db.asset.create({
          data: {
            videoId: data.videoId ?? null,
            kind: data.kind,
            storageKey: data.storageKey,
            mimeType: data.mimeType,
            bytes: data.bytes ?? null,
            durationSec: data.durationSec ?? null,
            width: data.width ?? null,
            height: data.height ?? null,
            provider: data.provider ?? null,
            externalId: data.externalId ?? null,
            costUsd: data.costUsd,
            license: data.license ?? null,
            attribution: data.attribution ?? null,
            checksum: data.checksum ?? null,
            metadata: json(data.metadata),
          },
        }),
      ),
    findById: async (id) => nullable(await this.db.asset.findUnique({ where: { id } }), mapAsset),
    listByVideo: async (videoId, kind) =>
      (await this.db.asset.findMany({ where: { videoId, ...(kind ? { kind } : {}) } })).map(mapAsset),
    findByChecksum: async (checksum) =>
      nullable(await this.db.asset.findFirst({ where: { checksum } }), mapAsset),
    delete: async (id) => {
      await this.db.asset.delete({ where: { id } });
    },
  };

  readonly voiceovers: P.VoiceoverRepository = {
    replaceAll: async (videoId, items) => {
      await this.db.$transaction(async (tx) => {
        await tx.voiceover.deleteMany({ where: { videoId } });
        if (items.length) {
          await tx.voiceover.createMany({
            data: items.map((v) => ({
              videoId,
              index: v.index,
              text: v.text,
              storageKey: v.storageKey,
              durationSec: v.durationSec,
              provider: v.provider,
              voiceId: v.voiceId,
              wordTimings: json(v.wordTimings),
              costUsd: v.costUsd,
            })),
          });
        }
      });
      return (await this.db.voiceover.findMany({ where: { videoId }, orderBy: { index: 'asc' } })).map(mapVoiceover);
    },
    listByVideo: async (videoId) =>
      (await this.db.voiceover.findMany({ where: { videoId }, orderBy: { index: 'asc' } })).map(mapVoiceover),
  };

  readonly timelines: P.TimelineRepository = {
    upsert: async (videoId, document, renderCmd) =>
      mapTimeline(
        await this.db.timeline.upsert({
          where: { videoId },
          create: { videoId, document: json(document) as Prisma.InputJsonValue, renderCmd: renderCmd ?? null },
          update: { document: json(document) as Prisma.InputJsonValue, renderCmd: renderCmd ?? null },
        }),
      ),
    findByVideo: async (videoId) => nullable(await this.db.timeline.findUnique({ where: { videoId } }), mapTimeline),
  };

  readonly thumbnails: P.ThumbnailRepository = {
    replaceAll: async (videoId, items) => {
      await this.db.$transaction(async (tx) => {
        await tx.thumbnail.deleteMany({ where: { videoId } });
        if (items.length) {
          await tx.thumbnail.createMany({
            data: items.map((t) => ({
              videoId,
              variant: t.variant,
              concept: t.concept,
              prompt: t.prompt,
              storageKey: t.storageKey ?? null,
              ctrPotential: t.ctrPotential,
              selected: t.selected,
              provider: t.provider ?? null,
              costUsd: t.costUsd,
            })),
          });
        }
      });
      return (await this.db.thumbnail.findMany({ where: { videoId }, orderBy: { variant: 'asc' } })).map(mapThumbnail);
    },
    listByVideo: async (videoId) =>
      (await this.db.thumbnail.findMany({ where: { videoId }, orderBy: { variant: 'asc' } })).map(mapThumbnail),
    select: async (videoId, variant) => {
      await this.db.$transaction([
        this.db.thumbnail.updateMany({ where: { videoId }, data: { selected: false } }),
        this.db.thumbnail.updateMany({ where: { videoId, variant }, data: { selected: true } }),
      ]);
      const selected = await this.db.thumbnail.findFirst({ where: { videoId, variant } });
      if (!selected) throw new NotFoundError('Thumbnail');
      return mapThumbnail(selected);
    },
    update: async (id, patch) =>
      mapThumbnail(
        await this.db.thumbnail.update({
          where: { id },
          data: {
            storageKey: patch.storageKey,
            ctrPotential: patch.ctrPotential,
            selected: patch.selected,
            costUsd: patch.costUsd,
            provider: patch.provider,
          },
        }),
      ),
  };

  readonly seo: P.SeoRepository = {
    upsert: async (videoId, data) => {
      const payload = {
        title: data.title,
        titleCandidates: json(data.titleCandidates) as Prisma.InputJsonValue,
        description: data.description,
        tags: data.tags,
        hashtags: data.hashtags,
        keywords: data.keywords,
        chapters: json(data.chapters) as Prisma.InputJsonValue,
        categoryId: data.categoryId,
      };
      return mapSeo(
        await this.db.seoMetadata.upsert({
          where: { videoId },
          create: { videoId, ...payload },
          update: payload,
        }),
      );
    },
    findByVideo: async (videoId) => nullable(await this.db.seoMetadata.findUnique({ where: { videoId } }), mapSeo),
  };

  readonly qc: P.QcRepository = {
    create: async (data) =>
      mapQc(
        await this.db.qcReport.create({
          data: {
            videoId: data.videoId,
            passed: data.passed,
            score: data.score,
            checks: json(data.checks) as Prisma.InputJsonValue,
            failures: json(data.failures) as Prisma.InputJsonValue,
            repairs: json(data.repairs),
          },
        }),
      ),
    latest: async (videoId) =>
      nullable(
        await this.db.qcReport.findFirst({ where: { videoId }, orderBy: { createdAt: 'desc' } }),
        mapQc,
      ),
    listByVideo: async (videoId) =>
      (await this.db.qcReport.findMany({ where: { videoId }, orderBy: { createdAt: 'desc' } })).map(mapQc),
  };

  readonly uploads: P.UploadRepository = {
    upsert: async (videoId, data) => {
      const payload = {
        state: data.state,
        privacyStatus: data.privacyStatus,
        youtubeVideoId: data.youtubeVideoId ?? null,
        resumableUri: data.resumableUri ?? null,
        bytesUploaded: BigInt(Math.round(data.bytesUploaded ?? 0)),
        error: data.error ?? null,
        startedAt: data.startedAt ?? null,
        completedAt: data.completedAt ?? null,
      };
      return mapUpload(
        await this.db.upload.upsert({
          where: { videoId },
          create: { videoId, ...payload },
          update: payload,
        }),
      );
    },
    findByVideo: async (videoId) => nullable(await this.db.upload.findUnique({ where: { videoId } }), mapUpload),
    update: async (videoId, patch) =>
      mapUpload(
        await this.db.upload.update({
          where: { videoId },
          data: {
            state: patch.state,
            youtubeVideoId: patch.youtubeVideoId,
            resumableUri: patch.resumableUri,
            bytesUploaded: patch.bytesUploaded === undefined ? undefined : BigInt(Math.round(patch.bytesUploaded)),
            error: patch.error,
            startedAt: patch.startedAt,
            completedAt: patch.completedAt,
            privacyStatus: patch.privacyStatus,
          },
        }),
      ),
  };

  readonly schedules: P.ScheduleRepository = {
    create: async (data) =>
      mapSlot(
        await this.db.scheduleSlot.create({
          data: {
            channelId: data.channelId,
            videoId: data.videoId ?? null,
            publishAt: data.publishAt,
            timezone: data.timezone,
            reserved: data.reserved,
          },
        }),
      ),
    findByVideo: async (videoId) =>
      nullable(await this.db.scheduleSlot.findUnique({ where: { videoId } }), mapSlot),
    listByChannel: async (channelId, from, to) =>
      (
        await this.db.scheduleSlot.findMany({
          where: { channelId, publishAt: { gte: from, lte: to } },
          orderBy: { publishAt: 'asc' },
        })
      ).map(mapSlot),
    listUpcoming: async (channelId, from) =>
      (
        await this.db.scheduleSlot.findMany({
          where: { channelId, publishAt: { gte: from } },
          orderBy: { publishAt: 'asc' },
        })
      ).map(mapSlot),
    update: async (id, patch) =>
      mapSlot(
        await this.db.scheduleSlot.update({
          where: { id },
          data: { publishAt: patch.publishAt, videoId: patch.videoId, reserved: patch.reserved },
        }),
      ),
    release: async (videoId) => {
      await this.db.scheduleSlot.updateMany({ where: { videoId }, data: { videoId: null, reserved: false } });
    },
  };

  readonly analytics: P.AnalyticsRepository = {
    create: async (data) =>
      mapAnalytics(
        await this.db.analyticsSnapshot.create({
          data: {
            videoId: data.videoId,
            ...(data.capturedAt ? { capturedAt: data.capturedAt } : {}),
            views: data.views,
            watchTimeMinutes: data.watchTimeMinutes,
            averageViewDuration: data.averageViewDuration,
            averageViewPercentage: data.averageViewPercentage,
            impressions: data.impressions,
            ctr: data.ctr,
            likes: data.likes,
            comments: data.comments,
            shares: data.shares,
            subscribersGained: data.subscribersGained,
            estimatedRevenueUsd: data.estimatedRevenueUsd ?? null,
            raw: json(data.raw),
          },
        }),
      ),
    latestByVideo: async (videoId) =>
      nullable(
        await this.db.analyticsSnapshot.findFirst({ where: { videoId }, orderBy: { capturedAt: 'desc' } }),
        mapAnalytics,
      ),
    listByVideo: async (videoId) =>
      (
        await this.db.analyticsSnapshot.findMany({ where: { videoId }, orderBy: { capturedAt: 'asc' } })
      ).map(mapAnalytics),
    latestForChannel: async (_channelId, videoIds) => {
      if (videoIds.length === 0) return [];
      const rows = await this.db.analyticsSnapshot.findMany({
        where: { videoId: { in: videoIds } },
        orderBy: { capturedAt: 'desc' },
      });
      const seen = new Set<string>();
      const out: R.AnalyticsSnapshotRecord[] = [];
      for (const row of rows) {
        if (seen.has(row.videoId)) continue;
        seen.add(row.videoId);
        out.push(mapAnalytics(row));
      }
      return out;
    },
  };

  readonly learnings: P.LearningRepository = {
    createMany: async (items) => {
      if (items.length === 0) return [];
      const created = await this.db.$transaction(
        items.map((i) =>
          this.db.learning.create({
            data: {
              channelId: i.channelId,
              videoId: i.videoId ?? null,
              dimension: i.dimension,
              observation: i.observation,
              predicted: i.predicted ?? null,
              actual: i.actual ?? null,
              delta: i.delta ?? null,
              weight: i.weight,
            },
          }),
        ),
      );
      return created.map(mapLearning);
    },
    listByChannel: async (channelId, limit = 100) =>
      (
        await this.db.learning.findMany({ where: { channelId }, orderBy: { createdAt: 'desc' }, take: limit })
      ).map(mapLearning),
  };

  readonly strategies: P.StrategyRepository = {
    upsert: async (data) => {
      const payload = {
        summary: data.summary,
        recommendations: json(data.recommendations) as Prisma.InputJsonValue,
        mix: json(data.mix) as Prisma.InputJsonValue,
      };
      return mapStrategy(
        await this.db.strategyPlan.upsert({
          where: { channelId_weekStart: { channelId: data.channelId, weekStart: data.weekStart } },
          create: { channelId: data.channelId, weekStart: data.weekStart, ...payload },
          update: payload,
        }),
      );
    },
    latest: async (channelId) =>
      nullable(
        await this.db.strategyPlan.findFirst({ where: { channelId }, orderBy: { weekStart: 'desc' } }),
        mapStrategy,
      ),
  };

  readonly contentTemplates: P.ContentTemplateRepository = {
    create: async (data) =>
      mapTemplate(
        await this.db.contentTemplate.create({
          data: {
            userId: data.userId,
            name: data.name,
            description: data.description ?? null,
            scriptStructure: json(data.scriptStructure) as Prisma.InputJsonValue,
            visualStyle: data.visualStyle,
            voiceProfile: json(data.voiceProfile),
            musicMood: data.musicMood ?? null,
            sceneDurationSec: data.sceneDurationSec,
            thumbnailStyle: data.thumbnailStyle ?? null,
            isSystem: data.isSystem,
          },
        }),
      ),
    findById: async (id) => nullable(await this.db.contentTemplate.findUnique({ where: { id } }), mapTemplate),
    listByUser: async (userId) =>
      (await this.db.contentTemplate.findMany({ where: { userId } })).map(mapTemplate),
    update: async (id, patch) =>
      mapTemplate(
        await this.db.contentTemplate.update({
          where: { id },
          data: {
            name: patch.name,
            description: patch.description,
            scriptStructure:
              patch.scriptStructure === undefined ? undefined : (json(patch.scriptStructure) as Prisma.InputJsonValue),
            visualStyle: patch.visualStyle,
            voiceProfile: patch.voiceProfile === undefined ? undefined : json(patch.voiceProfile),
            musicMood: patch.musicMood,
            sceneDurationSec: patch.sceneDurationSec,
            thumbnailStyle: patch.thumbnailStyle,
          },
        }),
      ),
    delete: async (id) => {
      await this.db.contentTemplate.delete({ where: { id } });
    },
  };

  readonly prompts: P.PromptRepository = {
    create: async (data) =>
      mapPrompt(
        await this.db.promptTemplate.create({
          data: {
            userId: data.userId ?? null,
            name: data.name,
            version: data.version,
            provider: data.provider ?? null,
            systemPrompt: data.systemPrompt,
            userTemplate: data.userTemplate,
            variables: data.variables,
            active: data.active,
            notes: data.notes ?? null,
          },
        }),
      ),
    findActive: async (name, userId) => {
      if (userId) {
        const scoped = await this.db.promptTemplate.findFirst({
          where: { name, userId, active: true },
          orderBy: { version: 'desc' },
        });
        if (scoped) return mapPrompt(scoped);
      }
      return nullable(
        await this.db.promptTemplate.findFirst({
          where: { name, userId: null, active: true },
          orderBy: { version: 'desc' },
        }),
        mapPrompt,
      );
    },
    listVersions: async (name) =>
      (await this.db.promptTemplate.findMany({ where: { name }, orderBy: { version: 'asc' } })).map(mapPrompt),
    list: async () => (await this.db.promptTemplate.findMany({ orderBy: { name: 'asc' } })).map(mapPrompt),
    activate: async (id) => {
      const target = await this.db.promptTemplate.findUnique({ where: { id } });
      if (!target) throw new NotFoundError('PromptTemplate');
      await this.db.$transaction([
        this.db.promptTemplate.updateMany({
          where: { name: target.name, userId: target.userId },
          data: { active: false },
        }),
        this.db.promptTemplate.update({ where: { id }, data: { active: true } }),
      ]);
      return mapPrompt((await this.db.promptTemplate.findUnique({ where: { id } }))!);
    },
    update: async (id, patch) =>
      mapPrompt(
        await this.db.promptTemplate.update({
          where: { id },
          data: {
            systemPrompt: patch.systemPrompt,
            userTemplate: patch.userTemplate,
            variables: patch.variables,
            active: patch.active,
            notes: patch.notes,
          },
        }),
      ),
  };

  readonly usage: P.UsageRepository = {
    record: async (data) =>
      mapUsage(
        await this.db.apiUsage.create({
          data: {
            channelId: data.channelId ?? null,
            videoId: data.videoId ?? null,
            jobId: data.jobId ?? null,
            provider: data.provider,
            operation: data.operation,
            model: data.model ?? null,
            inputUnits: data.inputUnits,
            outputUnits: data.outputUnits,
            unit: data.unit,
            estimatedCost: data.estimatedCost,
            actualCost: data.actualCost,
            latencyMs: data.latencyMs,
            status: data.status,
            error: data.error ?? null,
          },
        }),
      ),
    sumForChannel: async (channelId, from, to) => {
      const agg = await this.db.apiUsage.aggregate({
        where: { channelId, createdAt: { gte: from, lt: to } },
        _sum: { actualCost: true, estimatedCost: true },
      });
      return agg._sum.actualCost ?? agg._sum.estimatedCost ?? 0;
    },
    sumForVideo: async (videoId) => {
      const agg = await this.db.apiUsage.aggregate({ where: { videoId }, _sum: { actualCost: true } });
      return agg._sum.actualCost ?? 0;
    },
    breakdownByProvider: async (from, to, channelId) => {
      const rows = await this.db.apiUsage.groupBy({
        by: ['provider'],
        where: { createdAt: { gte: from, lt: to }, ...(channelId ? { channelId } : {}) },
        _sum: { actualCost: true },
        _count: { _all: true },
      });
      return rows
        .map((r) => ({ provider: r.provider, cost: r._sum.actualCost ?? 0, calls: r._count._all }))
        .sort((a, b) => b.cost - a.cost);
    },
    listRecent: async (limit, channelId) =>
      (
        await this.db.apiUsage.findMany({
          where: channelId ? { channelId } : undefined,
          orderBy: { createdAt: 'desc' },
          take: limit,
        })
      ).map(mapUsage),
    totalCost: async (from, to) => {
      const agg = await this.db.apiUsage.aggregate({
        where: { createdAt: { gte: from, lt: to } },
        _sum: { actualCost: true },
      });
      return agg._sum.actualCost ?? 0;
    },
  };

  readonly agentRuns: P.AgentRunRepository = {
    record: async (data) =>
      mapAgentRun(
        await this.db.agentRun.create({
          data: {
            videoId: data.videoId ?? null,
            agent: data.agent,
            promptId: data.promptId ?? null,
            promptName: data.promptName,
            promptVersion: data.promptVersion,
            provider: data.provider,
            model: data.model ?? null,
            ok: data.ok,
            attempts: data.attempts,
            latencyMs: data.latencyMs,
            costUsd: data.costUsd,
            input: json(data.input),
            output: json(data.output),
            error: data.error ?? null,
          },
        }),
      ),
    listByVideo: async (videoId) =>
      (await this.db.agentRun.findMany({ where: { videoId }, orderBy: { createdAt: 'asc' } })).map(mapAgentRun),
    statsByPrompt: async (name) => {
      const rows = await this.db.agentRun.groupBy({
        by: ['promptVersion'],
        where: { promptName: name },
        _count: { _all: true },
        _avg: { latencyMs: true, costUsd: true },
      });
      const okRows = await this.db.agentRun.groupBy({
        by: ['promptVersion'],
        where: { promptName: name, ok: true },
        _count: { _all: true },
      });
      const okByVersion = new Map(okRows.map((r) => [r.promptVersion, r._count._all]));
      return rows
        .map((r) => ({
          version: r.promptVersion,
          runs: r._count._all,
          okRate: r._count._all ? (okByVersion.get(r.promptVersion) ?? 0) / r._count._all : 0,
          avgLatencyMs: Math.round(r._avg.latencyMs ?? 0),
          avgCost: r._avg.costUsd ?? 0,
        }))
        .sort((a, b) => a.version - b.version);
    },
  };

  readonly decisions: P.DecisionRepository = {
    record: async (data) =>
      mapDecision(
        await this.db.decisionLog.create({
          data: {
            videoId: data.videoId ?? null,
            channelId: data.channelId ?? null,
            subject: data.subject,
            decision: data.decision,
            reason: data.reason,
            score: data.score ?? null,
            dataUsed: json(data.dataUsed),
          },
        }),
      ),
    listByVideo: async (videoId) =>
      (await this.db.decisionLog.findMany({ where: { videoId }, orderBy: { createdAt: 'asc' } })).map(mapDecision),
    listByChannel: async (channelId, limit = 100) =>
      (
        await this.db.decisionLog.findMany({
          where: { channelId },
          orderBy: { createdAt: 'desc' },
          take: limit,
        })
      ).map(mapDecision),
  };

  readonly jobs: P.JobRepository = {
    create: async (data) =>
      mapJob(
        await this.db.job.create({
          data: {
            queue: data.queue,
            name: data.name,
            channelId: data.channelId ?? null,
            videoId: data.videoId ?? null,
            state: data.state,
            payload: json(data.payload) as Prisma.InputJsonValue,
            attemptCount: data.attemptCount,
            maxAttempts: data.maxAttempts,
          },
        }),
      ),
    findById: async (id) => nullable(await this.db.job.findUnique({ where: { id } }), mapJob),
    update: async (id, patch) =>
      mapJob(
        await this.db.job.update({
          where: { id },
          data: {
            state: patch.state,
            attemptCount: patch.attemptCount,
            lastError: patch.lastError,
            retryAt: patch.retryAt,
            startedAt: patch.startedAt,
            finishedAt: patch.finishedAt,
          },
        }),
      ),
    listByVideo: async (videoId) =>
      (await this.db.job.findMany({ where: { videoId }, orderBy: { createdAt: 'asc' } })).map(mapJob),
    listByState: async (state, limit = 100) =>
      (
        await this.db.job.findMany({
          where: { state: { in: ([] as JobState[]).concat(state) } },
          orderBy: { createdAt: 'asc' },
          take: limit,
        })
      ).map(mapJob),
    countByState: async () => {
      const rows = await this.db.job.groupBy({ by: ['state'], _count: { _all: true } });
      return Object.fromEntries(rows.map((r) => [r.state, r._count._all]));
    },
    recordError: async (data) =>
      mapJobError(
        await this.db.jobError.create({
          data: {
            jobId: data.jobId,
            attempt: data.attempt,
            message: data.message,
            stack: data.stack ?? null,
            provider: data.provider ?? null,
          },
        }),
      ),
    listErrors: async (limit) =>
      (await this.db.jobError.findMany({ orderBy: { createdAt: 'desc' }, take: limit })).map(mapJobError),
  };

  readonly rules: P.RuleRepository = {
    create: async (data) =>
      mapRule(
        await this.db.automationRule.create({
          data: {
            channelId: data.channelId,
            name: data.name,
            condition: json(data.condition) as Prisma.InputJsonValue,
            action: json(data.action) as Prisma.InputJsonValue,
            enabled: data.enabled,
            priority: data.priority,
          },
        }),
      ),
    listByChannel: async (channelId) =>
      (await this.db.automationRule.findMany({ where: { channelId }, orderBy: { priority: 'asc' } })).map(mapRule),
    update: async (id, patch) =>
      mapRule(
        await this.db.automationRule.update({
          where: { id },
          data: {
            name: patch.name,
            condition: patch.condition === undefined ? undefined : (json(patch.condition) as Prisma.InputJsonValue),
            action: patch.action === undefined ? undefined : (json(patch.action) as Prisma.InputJsonValue),
            enabled: patch.enabled,
            priority: patch.priority,
          },
        }),
      ),
    delete: async (id) => {
      await this.db.automationRule.delete({ where: { id } });
    },
  };

  readonly notifications: P.NotificationRepository = {
    create: async (data) =>
      mapNotification(
        await this.db.notificationTarget.create({
          data: {
            userId: data.userId,
            kind: data.kind,
            target: data.target,
            events: data.events,
            enabled: data.enabled,
          },
        }),
      ),
    listByUser: async (userId) =>
      (await this.db.notificationTarget.findMany({ where: { userId } })).map(mapNotification),
    listForEvent: async (userId, event) => {
      const rows = await this.db.notificationTarget.findMany({ where: { userId, enabled: true } });
      return rows.filter((r) => r.events.length === 0 || r.events.includes(event)).map(mapNotification);
    },
    findByKindTarget: async (kind, target) =>
      nullable(await this.db.notificationTarget.findFirst({ where: { kind, target } }), mapNotification),
    delete: async (id) => {
      await this.db.notificationTarget.delete({ where: { id } });
    },
  };

  readonly characters: P.CharacterRepository = {
    upsert: async (channelId, data) => {
      const payload = {
        age: data.age ?? null,
        gender: data.gender ?? null,
        clothing: data.clothing ?? null,
        hair: data.hair ?? null,
        face: data.face ?? null,
        bodyType: data.bodyType ?? null,
        style: data.style ?? null,
        referenceKey: data.referenceKey ?? null,
      };
      return mapCharacter(
        await this.db.characterProfile.upsert({
          where: { channelId_name: { channelId, name: data.name } },
          create: { channelId, name: data.name, ...payload },
          update: payload,
        }),
      );
    },
    listByChannel: async (channelId) =>
      (await this.db.characterProfile.findMany({ where: { channelId } })).map(mapCharacter),
  };

  readonly music: P.MusicRepository = {
    create: async (data) =>
      mapMusic(
        await this.db.musicTrack.create({
          data: {
            title: data.title,
            source: data.source,
            license: data.license,
            attribution: data.attribution ?? null,
            durationSec: data.durationSec,
            mood: data.mood,
            storageKey: data.storageKey,
            bpm: data.bpm ?? null,
          },
        }),
      ),
    list: async () => (await this.db.musicTrack.findMany()).map(mapMusic),
    findByMood: async (mood, minDurationSec) => {
      const exact = await this.db.musicTrack.findFirst({
        where: { mood: { equals: mood, mode: 'insensitive' }, durationSec: { gte: minDurationSec } },
      });
      if (exact) return mapMusic(exact);
      return nullable(
        await this.db.musicTrack.findFirst({ where: { durationSec: { gte: minDurationSec } } }),
        mapMusic,
      );
    },
  };

  readonly providerCredentials: P.ProviderCredentialRepository = {
    upsert: async (userId, providerKey, ciphertext, hint) =>
      mapCredential(
        await this.db.providerCredential.upsert({
          where: { userId_providerKey: { userId, providerKey } },
          create: { userId, providerKey, ciphertext, hint: hint ?? null },
          update: { ciphertext, hint: hint ?? null },
        }),
      ),
    listByUser: async (userId) =>
      (await this.db.providerCredential.findMany({ where: { userId } })).map(mapCredential),
    find: async (userId, providerKey) =>
      nullable(
        await this.db.providerCredential.findUnique({ where: { userId_providerKey: { userId, providerKey } } }),
        mapCredential,
      ),
    delete: async (userId, providerKey) => {
      await this.db.providerCredential.deleteMany({ where: { userId, providerKey } });
    },
  };
}

// ── mapping helpers ──────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

function nullable<T, U>(row: T | null, map: (row: T) => U): U | null {
  return row === null ? null : map(row);
}

function json(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return null as unknown as typeof Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === 'P2002';
}

const mapUser = (r: Row) => r as unknown as R.UserRecord;
const mapSession = (r: Row) => r as unknown as R.SessionRecord;
const mapChannel = (r: Row): R.ChannelRecord => ({
  ...(r as unknown as R.ChannelRecord),
  viewCount: fromBigInt(r.viewCount as bigint | null),
});
const mapSettings = (r: Row) => r as unknown as R.ChannelSettingsRecord;
const mapOAuth = (r: Row) => r as unknown as R.OAuthAccountRecord;
const mapCompetitor = (r: Row) => r as unknown as R.CompetitorChannelRecord;
const mapSource = (r: Row) => r as unknown as R.DiscoverySourceRecord;
const mapSignal = (r: Row, channelId: string): R.TrendSignalRecord => ({
  ...(r as unknown as R.TrendSignalRecord),
  channelId,
});
const mapIdea = (r: Row) => r as unknown as R.ContentIdeaRecord;
const mapVideo = (r: Row): R.VideoRecord => ({
  ...(r as unknown as R.VideoRecord),
  fileSizeBytes: fromBigInt(r.fileSizeBytes as bigint | null),
});
const mapResearch = (r: Row) => r as unknown as R.ResearchRecord;
const mapResearchSource = (r: Row) => r as unknown as R.ResearchSourceRecord;
const mapScript = (r: Row) => r as unknown as R.ScriptRecord;
const mapScene = (r: Row) => r as unknown as R.SceneRecord;
const mapAsset = (r: Row) => r as unknown as R.AssetRecord;
const mapVoiceover = (r: Row) => r as unknown as R.VoiceoverRecord;
const mapTimeline = (r: Row) => r as unknown as R.TimelineRecord;
const mapThumbnail = (r: Row) => r as unknown as R.ThumbnailRecord;
const mapSeo = (r: Row) => r as unknown as R.SeoMetadataRecord;
const mapQc = (r: Row) => r as unknown as R.QcReportRecord;
const mapUpload = (r: Row): R.UploadRecord => ({
  ...(r as unknown as R.UploadRecord),
  bytesUploaded: Number(r.bytesUploaded ?? 0),
});
const mapSlot = (r: Row) => r as unknown as R.ScheduleSlotRecord;
const mapAnalytics = (r: Row) => r as unknown as R.AnalyticsSnapshotRecord;
const mapLearning = (r: Row) => r as unknown as R.LearningRecord;
const mapStrategy = (r: Row) => r as unknown as R.StrategyPlanRecord;
const mapTemplate = (r: Row) => r as unknown as R.ContentTemplateRecord;
const mapPrompt = (r: Row) => r as unknown as R.PromptTemplateRecord;
const mapUsage = (r: Row) => r as unknown as R.ApiUsageRecord;
const mapAgentRun = (r: Row) => r as unknown as R.AgentRunRecord;
const mapDecision = (r: Row) => r as unknown as R.DecisionLogRecord;
const mapJob = (r: Row) => r as unknown as R.JobRecord;
const mapJobError = (r: Row) => r as unknown as R.JobErrorRecord;
const mapRule = (r: Row) => r as unknown as R.AutomationRuleRecord;
const mapNotification = (r: Row) => r as unknown as R.NotificationTargetRecord;
const mapCharacter = (r: Row) => r as unknown as R.CharacterProfileRecord;
const mapMusic = (r: Row) => r as unknown as R.MusicTrackRecord;
const mapCredential = (r: Row) => r as unknown as R.ProviderCredentialRecord;

/** Only the columns a settings write may touch — keeps `id`/timestamps out of the payload. */
function settingsPayload(data: Partial<R.ChannelSettingsRecord>): Prisma.ChannelSettingsUpdateInput {
  const { id: _id, channelId: _channelId, createdAt: _c, updatedAt: _u, ...rest } = data;
  return {
    ...rest,
    voiceSettings: rest.voiceSettings === undefined ? undefined : json(rest.voiceSettings),
    ideaWeights: rest.ideaWeights === undefined ? undefined : json(rest.ideaWeights),
  } as Prisma.ChannelSettingsUpdateInput;
}
