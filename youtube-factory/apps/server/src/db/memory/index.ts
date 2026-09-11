import { Collection, sortBy } from './collection.js';
import type * as P from '../ports.js';
import type * as R from '../types.js';
import { ConflictError, NotFoundError } from '../../shared/errors.js';
import type { Clock } from '../../shared/clock.js';
import { systemClock } from '../../shared/clock.js';
import type { IdeaStatus, JobState, VideoStatus } from '../../shared/types.js';

/**
 * In-memory implementation of every repository port (spec §73). It is a first-class
 * adapter, not a stub: the acceptance end-to-end run and the whole test suite execute
 * against it, so it implements the same filtering, ordering and constraint semantics as
 * the Prisma adapter.
 */
export class InMemoryRepositories implements P.Repositories {
  private readonly t = {
    users: new Collection<R.UserRecord>('User'),
    sessions: new Collection<R.SessionRecord>('Session'),
    channels: new Collection<R.ChannelRecord>('Channel'),
    channelSettings: new Collection<R.ChannelSettingsRecord>('ChannelSettings'),
    oauth: new Collection<R.OAuthAccountRecord>('OAuthAccount'),
    competitors: new Collection<R.CompetitorChannelRecord>('CompetitorChannel'),
    sources: new Collection<R.DiscoverySourceRecord>('DiscoverySource'),
    signals: new Collection<R.TrendSignalRecord>('TrendSignal'),
    ideas: new Collection<R.ContentIdeaRecord>('ContentIdea'),
    videos: new Collection<R.VideoRecord>('Video'),
    research: new Collection<R.ResearchRecord>('Research'),
    researchSources: new Collection<R.ResearchSourceRecord>('ResearchSource'),
    scripts: new Collection<R.ScriptRecord>('Script'),
    scenes: new Collection<R.SceneRecord>('Scene'),
    assets: new Collection<R.AssetRecord>('Asset'),
    voiceovers: new Collection<R.VoiceoverRecord>('Voiceover'),
    timelines: new Collection<R.TimelineRecord>('Timeline'),
    thumbnails: new Collection<R.ThumbnailRecord>('Thumbnail'),
    seo: new Collection<R.SeoMetadataRecord>('SeoMetadata'),
    qc: new Collection<R.QcReportRecord>('QcReport'),
    uploads: new Collection<R.UploadRecord>('Upload'),
    schedules: new Collection<R.ScheduleSlotRecord>('ScheduleSlot'),
    analytics: new Collection<R.AnalyticsSnapshotRecord>('AnalyticsSnapshot'),
    learnings: new Collection<R.LearningRecord>('Learning'),
    strategies: new Collection<R.StrategyPlanRecord>('StrategyPlan'),
    contentTemplates: new Collection<R.ContentTemplateRecord>('ContentTemplate'),
    prompts: new Collection<R.PromptTemplateRecord>('PromptTemplate'),
    usage: new Collection<R.ApiUsageRecord>('ApiUsage'),
    agentRuns: new Collection<R.AgentRunRecord>('AgentRun'),
    decisions: new Collection<R.DecisionLogRecord>('DecisionLog'),
    jobs: new Collection<R.JobRecord>('Job'),
    jobErrors: new Collection<R.JobErrorRecord>('JobError'),
    rules: new Collection<R.AutomationRuleRecord>('AutomationRule'),
    notifications: new Collection<R.NotificationTargetRecord>('NotificationTarget'),
    characters: new Collection<R.CharacterProfileRecord>('CharacterProfile'),
    music: new Collection<R.MusicTrackRecord>('MusicTrack'),
    providerCredentials: new Collection<R.ProviderCredentialRecord>('ProviderCredential'),
  };

  constructor(private readonly clock: Clock = systemClock) {}

  private stamps() {
    const now = this.clock.now();
    return { createdAt: now, updatedAt: now };
  }

  reset(): void {
    for (const collection of Object.values(this.t)) collection.clear();
  }

  async close(): Promise<void> {
    /* nothing to release */
  }

  // ── users / sessions ───────────────────────────────────────────────────────

  readonly users: P.UserRepository = {
    create: async (data) => {
      const existing = this.t.users.find((u) => u.email.toLowerCase() === data.email.toLowerCase());
      if (existing) throw new ConflictError('An account with that email already exists');
      return this.t.users.insert({ ...this.stamps(), ...data });
    },
    findById: async (id) => this.t.users.get(id),
    findByEmail: async (email) =>
      this.t.users.find((u) => u.email.toLowerCase() === email.toLowerCase()),
    update: async (id, patch) => this.t.users.update(id, { ...patch, updatedAt: this.clock.now() }),
    count: async () => this.t.users.size,
    list: async (limit = 100) => sortBy(this.t.users.all(), (u) => u.createdAt.getTime(), 'desc').slice(0, limit),
  };

  readonly sessions: P.SessionRepository = {
    create: async (data) => this.t.sessions.insert({ createdAt: this.clock.now(), ...data }),
    findByTokenHash: async (hash) => this.t.sessions.find((s) => s.tokenHash === hash),
    revoke: async (id, at) => {
      this.t.sessions.update(id, { revokedAt: at });
    },
    revokeAllForUser: async (userId, at) => {
      for (const s of this.t.sessions.filter((x) => x.userId === userId && !x.revokedAt)) {
        this.t.sessions.update(s.id, { revokedAt: at });
      }
    },
    deleteExpired: async (before) => this.t.sessions.deleteWhere((s) => s.expiresAt < before),
  };

  // ── channels ───────────────────────────────────────────────────────────────

  readonly channels: P.ChannelRepository = {
    create: async (data) => this.t.channels.insert({ ...this.stamps(), ...data }),
    findById: async (id) => this.t.channels.get(id),
    findByYoutubeId: async (userId, youtubeChannelId) =>
      this.t.channels.find((c) => c.userId === userId && c.youtubeChannelId === youtubeChannelId),
    listByUser: async (userId) =>
      sortBy(this.t.channels.filter((c) => c.userId === userId), (c) => c.createdAt.getTime()),
    listEnabled: async () => this.t.channels.filter((c) => c.enabled),
    update: async (id, patch) => this.t.channels.update(id, { ...patch, updatedAt: this.clock.now() }),
    delete: async (id) => {
      this.t.channels.delete(id);
      this.t.channelSettings.deleteWhere((s) => s.channelId === id);
      this.t.oauth.deleteWhere((o) => o.channelId === id);
      for (const video of this.t.videos.filter((v) => v.channelId === id)) {
        await this.videos.delete(video.id);
      }
      this.t.ideas.deleteWhere((i) => i.channelId === id);
      this.t.sources.deleteWhere((s) => s.channelId === id);
      this.t.competitors.deleteWhere((c) => c.channelId === id);
      this.t.schedules.deleteWhere((s) => s.channelId === id);
      this.t.rules.deleteWhere((r) => r.channelId === id);
    },
    clearDefault: async (userId) => {
      for (const c of this.t.channels.filter((x) => x.userId === userId && x.isDefault)) {
        this.t.channels.update(c.id, { isDefault: false });
      }
    },
    count: async () => this.t.channels.size,
  };

  readonly channelSettings: P.ChannelSettingsRepository = {
    upsert: async (channelId, data) => {
      const found = this.t.channelSettings.find((s) => s.channelId === channelId);
      if (found) return this.t.channelSettings.update(found.id, { ...data, updatedAt: this.clock.now() });
      return this.t.channelSettings.insert({ ...this.stamps(), ...data, channelId });
    },
    findByChannel: async (channelId) => this.t.channelSettings.find((s) => s.channelId === channelId),
    update: async (channelId, patch) => {
      const found = this.t.channelSettings.find((s) => s.channelId === channelId);
      if (!found) throw new NotFoundError('ChannelSettings');
      return this.t.channelSettings.update(found.id, { ...patch, updatedAt: this.clock.now() });
    },
  };

  readonly oauth: P.OAuthRepository = {
    upsert: async (data) => {
      const found = this.t.oauth.find((o) => o.channelId === data.channelId);
      if (found) return this.t.oauth.update(found.id, { ...data, updatedAt: this.clock.now() });
      return this.t.oauth.insert({ ...this.stamps(), ...data });
    },
    findByChannel: async (channelId) => this.t.oauth.find((o) => o.channelId === channelId),
    deleteByChannel: async (channelId) => {
      this.t.oauth.deleteWhere((o) => o.channelId === channelId);
    },
  };

  readonly competitors: P.CompetitorRepository = {
    create: async (data) => {
      const dup = this.t.competitors.find(
        (c) => c.channelId === data.channelId && c.youtubeChannelId === data.youtubeChannelId,
      );
      if (dup) throw new ConflictError('That competitor is already tracked for this channel');
      return this.t.competitors.insert({ createdAt: this.clock.now(), ...data });
    },
    listByChannel: async (channelId) => this.t.competitors.filter((c) => c.channelId === channelId),
    update: async (id, patch) => this.t.competitors.update(id, patch),
    delete: async (id) => this.t.competitors.delete(id),
  };

  readonly discovery: P.DiscoveryRepository = {
    createSource: async (data) => this.t.sources.insert({ createdAt: this.clock.now(), ...data }),
    listSources: async (channelId) => this.t.sources.filter((s) => s.channelId === channelId),
    updateSource: async (id, patch) => this.t.sources.update(id, patch),
    deleteSource: async (id) => {
      this.t.sources.delete(id);
      this.t.signals.deleteWhere((s) => s.sourceId === id);
    },
    recordSignals: async (signals) =>
      signals.map((s) => this.t.signals.insert({ ...s, observedAt: s.observedAt ?? this.clock.now() })),
    recentSignals: async (channelId, since, limit = 100) =>
      sortBy(
        this.t.signals.filter((s) => s.channelId === channelId && s.observedAt >= since),
        (s) => s.score,
        'desc',
      ).slice(0, limit),
  };

  // ── ideas ──────────────────────────────────────────────────────────────────

  readonly ideas: P.IdeaRepository = {
    createMany: async (data) => data.map((d) => this.t.ideas.insert({ ...this.stamps(), ...d })),
    findById: async (id) => this.t.ideas.get(id),
    listByChannel: async (channelId, filter = {}) => {
      let rows = this.t.ideas.filter(
        (i) => i.channelId === channelId && (!filter.status || i.status === filter.status),
      );
      rows = sortBy(rows, (i) => i.overallScore, 'desc');
      return filter.limit ? rows.slice(0, filter.limit) : rows;
    },
    update: async (id, patch) => this.t.ideas.update(id, { ...patch, updatedAt: this.clock.now() }),
    delete: async (id) => this.t.ideas.delete(id),
    bestCandidate: async (channelId, minScore, allowProposed) => {
      const statuses: IdeaStatus[] = allowProposed ? ['APPROVED', 'PROPOSED'] : ['APPROVED'];
      const rows = this.t.ideas.filter(
        (i) => i.channelId === channelId && statuses.includes(i.status) && i.overallScore >= minScore,
      );
      return sortBy(rows, (i) => i.overallScore, 'desc')[0] ?? null;
    },
  };

  // ── videos ─────────────────────────────────────────────────────────────────

  readonly videos: P.VideoRepository = {
    create: async (data) => this.t.videos.insert({ ...this.stamps(), ...data }),
    findById: async (id) => this.t.videos.get(id),
    update: async (id, patch) => this.t.videos.update(id, { ...patch, updatedAt: this.clock.now() }),
    delete: async (id) => {
      this.t.videos.delete(id);
      const research = this.t.research.find((r) => r.videoId === id);
      if (research) this.t.researchSources.deleteWhere((s) => s.researchId === research.id);
      this.t.research.deleteWhere((r) => r.videoId === id);
      this.t.scripts.deleteWhere((s) => s.videoId === id);
      this.t.scenes.deleteWhere((s) => s.videoId === id);
      this.t.assets.deleteWhere((a) => a.videoId === id);
      this.t.voiceovers.deleteWhere((v) => v.videoId === id);
      this.t.timelines.deleteWhere((t) => t.videoId === id);
      this.t.thumbnails.deleteWhere((t) => t.videoId === id);
      this.t.seo.deleteWhere((s) => s.videoId === id);
      this.t.qc.deleteWhere((q) => q.videoId === id);
      this.t.uploads.deleteWhere((u) => u.videoId === id);
      this.t.analytics.deleteWhere((a) => a.videoId === id);
      for (const slot of this.t.schedules.filter((s) => s.videoId === id)) {
        this.t.schedules.update(slot.id, { videoId: null, reserved: false });
      }
    },
    listByChannel: async (channelId, filter = {}) => {
      const wanted = filter.status ? ([] as VideoStatus[]).concat(filter.status) : null;
      const rows = sortBy(
        this.t.videos.filter((v) => v.channelId === channelId && (!wanted || wanted.includes(v.status))),
        (v) => v.createdAt.getTime(),
        'desc',
      );
      const offset = filter.offset ?? 0;
      const limit = filter.limit ?? rows.length;
      return { items: rows.slice(offset, offset + limit), total: rows.length };
    },
    listByStatus: async (status, limit = 100) => {
      const wanted = ([] as VideoStatus[]).concat(status);
      return sortBy(this.t.videos.filter((v) => wanted.includes(v.status)), (v) => v.updatedAt.getTime()).slice(
        0,
        limit,
      );
    },
    listDueForPublish: async (now, limit = 50) =>
      sortBy(
        this.t.videos.filter((v) => v.status === 'SCHEDULED' && !!v.publishAt && v.publishAt <= now),
        (v) => v.publishAt?.getTime() ?? 0,
      ).slice(0, limit),
    listPublishedSince: async (channelId, since) =>
      sortBy(
        this.t.videos.filter(
          (v) => v.channelId === channelId && !!v.publishedAt && v.publishedAt >= since,
        ),
        (v) => v.publishedAt?.getTime() ?? 0,
        'desc',
      ),
    countByStatus: async (channelId) => {
      const out: Record<string, number> = {};
      for (const v of this.t.videos.filter((x) => x.channelId === channelId)) {
        out[v.status] = (out[v.status] ?? 0) + 1;
      }
      return out;
    },
    count: async () => this.t.videos.size,
  };

  // ── production artefacts ───────────────────────────────────────────────────

  readonly research: P.ResearchRepository = {
    upsert: async (videoId, data, sources) => {
      const existing = this.t.research.find((r) => r.videoId === videoId);
      if (existing) this.t.researchSources.deleteWhere((s) => s.researchId === existing.id);
      const record = existing
        ? this.t.research.update(existing.id, data as Partial<R.ResearchRecord>)
        : this.t.research.insert({ createdAt: this.clock.now(), ...data, videoId });
      for (const source of sources) this.t.researchSources.insert({ ...source, researchId: record.id });
      return record;
    },
    findByVideo: async (videoId) => {
      const record = this.t.research.find((r) => r.videoId === videoId);
      if (!record) return null;
      return { ...record, sources: this.t.researchSources.filter((s) => s.researchId === record.id) };
    },
    updateSourceVerdicts: async (researchId, updates) => {
      for (const update of updates) {
        const row = this.t.researchSources.find(
          (s) => s.researchId === researchId && s.claim === update.claim,
        );
        if (row) this.t.researchSources.update(row.id, { verdict: update.verdict, confidence: update.confidence });
      }
    },
  };

  readonly scripts: P.ScriptRepository = {
    upsert: async (videoId, data) => {
      const existing = this.t.scripts.find((s) => s.videoId === videoId);
      if (existing) {
        return this.t.scripts.update(existing.id, {
          ...(data as Partial<R.ScriptRecord>),
          revision: existing.revision + 1,
          updatedAt: this.clock.now(),
        });
      }
      return this.t.scripts.insert({ ...this.stamps(), ...data, videoId });
    },
    findByVideo: async (videoId) => this.t.scripts.find((s) => s.videoId === videoId),
    update: async (videoId, patch) => {
      const existing = this.t.scripts.find((s) => s.videoId === videoId);
      if (!existing) throw new NotFoundError('Script');
      return this.t.scripts.update(existing.id, { ...patch, updatedAt: this.clock.now() });
    },
  };

  readonly scenes: P.SceneRepository = {
    replaceAll: async (videoId, scenes) => {
      this.t.scenes.deleteWhere((s) => s.videoId === videoId);
      return scenes.map((s) => this.t.scenes.insert({ createdAt: this.clock.now(), ...s, videoId }));
    },
    listByVideo: async (videoId) => sortBy(this.t.scenes.filter((s) => s.videoId === videoId), (s) => s.index),
    update: async (id, patch) => this.t.scenes.update(id, patch),
  };

  readonly assets: P.AssetRepository = {
    create: async (data) => this.t.assets.insert({ createdAt: this.clock.now(), ...data }),
    findById: async (id) => this.t.assets.get(id),
    listByVideo: async (videoId, kind) =>
      this.t.assets.filter((a) => a.videoId === videoId && (!kind || a.kind === kind)),
    findByChecksum: async (checksum) => this.t.assets.find((a) => a.checksum === checksum),
    delete: async (id) => this.t.assets.delete(id),
  };

  readonly voiceovers: P.VoiceoverRepository = {
    replaceAll: async (videoId, items) => {
      this.t.voiceovers.deleteWhere((v) => v.videoId === videoId);
      return items.map((v) => this.t.voiceovers.insert({ createdAt: this.clock.now(), ...v, videoId }));
    },
    listByVideo: async (videoId) =>
      sortBy(this.t.voiceovers.filter((v) => v.videoId === videoId), (v) => v.index),
  };

  readonly timelines: P.TimelineRepository = {
    upsert: async (videoId, document, renderCmd) => {
      const existing = this.t.timelines.find((t) => t.videoId === videoId);
      if (existing) {
        return this.t.timelines.update(existing.id, {
          document,
          renderCmd: renderCmd ?? null,
          updatedAt: this.clock.now(),
        });
      }
      return this.t.timelines.insert({
        ...this.stamps(),
        videoId,
        document,
        renderCmd: renderCmd ?? null,
      });
    },
    findByVideo: async (videoId) => this.t.timelines.find((t) => t.videoId === videoId),
  };

  readonly thumbnails: P.ThumbnailRepository = {
    replaceAll: async (videoId, items) => {
      this.t.thumbnails.deleteWhere((t) => t.videoId === videoId);
      return items.map((t) => this.t.thumbnails.insert({ createdAt: this.clock.now(), ...t, videoId }));
    },
    listByVideo: async (videoId) =>
      sortBy(this.t.thumbnails.filter((t) => t.videoId === videoId), (t) => t.variant),
    select: async (videoId, variant) => {
      let selected: R.ThumbnailRecord | null = null;
      for (const t of this.t.thumbnails.filter((x) => x.videoId === videoId)) {
        const updated = this.t.thumbnails.update(t.id, { selected: t.variant === variant });
        if (updated.selected) selected = updated;
      }
      if (!selected) throw new NotFoundError('Thumbnail');
      return selected;
    },
    update: async (id, patch) => this.t.thumbnails.update(id, patch),
  };

  readonly seo: P.SeoRepository = {
    upsert: async (videoId, data) => {
      const existing = this.t.seo.find((s) => s.videoId === videoId);
      if (existing) {
        return this.t.seo.update(existing.id, { ...(data as Partial<R.SeoMetadataRecord>), updatedAt: this.clock.now() });
      }
      return this.t.seo.insert({ ...this.stamps(), ...data, videoId });
    },
    findByVideo: async (videoId) => this.t.seo.find((s) => s.videoId === videoId),
  };

  readonly qc: P.QcRepository = {
    create: async (data) => this.t.qc.insert({ createdAt: this.clock.now(), ...data }),
    latest: async (videoId) =>
      sortBy(this.t.qc.filter((q) => q.videoId === videoId), (q) => q.createdAt.getTime(), 'desc')[0] ?? null,
    listByVideo: async (videoId) =>
      sortBy(this.t.qc.filter((q) => q.videoId === videoId), (q) => q.createdAt.getTime(), 'desc'),
  };

  readonly uploads: P.UploadRepository = {
    upsert: async (videoId, data) => {
      const existing = this.t.uploads.find((u) => u.videoId === videoId);
      if (existing) {
        return this.t.uploads.update(existing.id, { ...(data as Partial<R.UploadRecord>), updatedAt: this.clock.now() });
      }
      return this.t.uploads.insert({ ...this.stamps(), ...data, videoId });
    },
    findByVideo: async (videoId) => this.t.uploads.find((u) => u.videoId === videoId),
    update: async (videoId, patch) => {
      const existing = this.t.uploads.find((u) => u.videoId === videoId);
      if (!existing) throw new NotFoundError('Upload');
      return this.t.uploads.update(existing.id, { ...patch, updatedAt: this.clock.now() });
    },
  };

  readonly schedules: P.ScheduleRepository = {
    create: async (data) => this.t.schedules.insert({ ...this.stamps(), ...data }),
    findByVideo: async (videoId) => this.t.schedules.find((s) => s.videoId === videoId),
    listByChannel: async (channelId, from, to) =>
      sortBy(
        this.t.schedules.filter((s) => s.channelId === channelId && s.publishAt >= from && s.publishAt <= to),
        (s) => s.publishAt.getTime(),
      ),
    listUpcoming: async (channelId, from) =>
      sortBy(
        this.t.schedules.filter((s) => s.channelId === channelId && s.publishAt >= from),
        (s) => s.publishAt.getTime(),
      ),
    update: async (id, patch) => this.t.schedules.update(id, { ...patch, updatedAt: this.clock.now() }),
    release: async (videoId) => {
      for (const slot of this.t.schedules.filter((s) => s.videoId === videoId)) {
        this.t.schedules.update(slot.id, { videoId: null, reserved: false });
      }
    },
  };

  readonly analytics: P.AnalyticsRepository = {
    create: async (data) => this.t.analytics.insert({ ...data, capturedAt: data.capturedAt ?? this.clock.now() }),
    latestByVideo: async (videoId) =>
      sortBy(this.t.analytics.filter((a) => a.videoId === videoId), (a) => a.capturedAt.getTime(), 'desc')[0] ?? null,
    listByVideo: async (videoId) =>
      sortBy(this.t.analytics.filter((a) => a.videoId === videoId), (a) => a.capturedAt.getTime()),
    latestForChannel: async (_channelId, videoIds) => {
      const out: R.AnalyticsSnapshotRecord[] = [];
      for (const videoId of videoIds) {
        const latest = sortBy(
          this.t.analytics.filter((a) => a.videoId === videoId),
          (a) => a.capturedAt.getTime(),
          'desc',
        )[0];
        if (latest) out.push(latest);
      }
      return out;
    },
  };

  readonly learnings: P.LearningRepository = {
    createMany: async (items) => items.map((i) => this.t.learnings.insert({ createdAt: this.clock.now(), ...i })),
    listByChannel: async (channelId, limit = 100) =>
      sortBy(this.t.learnings.filter((l) => l.channelId === channelId), (l) => l.createdAt.getTime(), 'desc').slice(
        0,
        limit,
      ),
  };

  readonly strategies: P.StrategyRepository = {
    upsert: async (data) => {
      const existing = this.t.strategies.find(
        (s) => s.channelId === data.channelId && s.weekStart.getTime() === data.weekStart.getTime(),
      );
      if (existing) return this.t.strategies.update(existing.id, data as Partial<R.StrategyPlanRecord>);
      return this.t.strategies.insert({ createdAt: this.clock.now(), ...data });
    },
    latest: async (channelId) =>
      sortBy(this.t.strategies.filter((s) => s.channelId === channelId), (s) => s.weekStart.getTime(), 'desc')[0] ??
      null,
  };

  readonly contentTemplates: P.ContentTemplateRepository = {
    create: async (data) => this.t.contentTemplates.insert({ ...this.stamps(), ...data }),
    findById: async (id) => this.t.contentTemplates.get(id),
    listByUser: async (userId) => this.t.contentTemplates.filter((t) => t.userId === userId),
    update: async (id, patch) => this.t.contentTemplates.update(id, { ...patch, updatedAt: this.clock.now() }),
    delete: async (id) => this.t.contentTemplates.delete(id),
  };

  readonly prompts: P.PromptRepository = {
    create: async (data) => this.t.prompts.insert({ ...this.stamps(), ...data }),
    findActive: async (name, userId) => {
      const candidates = this.t.prompts.filter((p) => p.name === name && p.active);
      const scoped = userId ? candidates.filter((p) => p.userId === userId) : [];
      const pool = scoped.length ? scoped : candidates.filter((p) => !p.userId);
      return sortBy(pool, (p) => p.version, 'desc')[0] ?? null;
    },
    listVersions: async (name) => sortBy(this.t.prompts.filter((p) => p.name === name), (p) => p.version),
    list: async () => sortBy(this.t.prompts.all(), (p) => p.name),
    activate: async (id) => {
      const target = this.t.prompts.require(id);
      for (const p of this.t.prompts.filter((x) => x.name === target.name && x.userId === target.userId)) {
        this.t.prompts.update(p.id, { active: p.id === id });
      }
      return this.t.prompts.require(id);
    },
    update: async (id, patch) => this.t.prompts.update(id, { ...patch, updatedAt: this.clock.now() }),
  };

  readonly usage: P.UsageRepository = {
    record: async (data) => this.t.usage.insert({ createdAt: this.clock.now(), ...data }),
    sumForChannel: async (channelId, from, to) =>
      round(
        this.t.usage
          .filter((u) => u.channelId === channelId && u.createdAt >= from && u.createdAt < to)
          .reduce((sum, u) => sum + (u.actualCost || u.estimatedCost), 0),
      ),
    sumForVideo: async (videoId) =>
      round(
        this.t.usage
          .filter((u) => u.videoId === videoId)
          .reduce((sum, u) => sum + (u.actualCost || u.estimatedCost), 0),
      ),
    breakdownByProvider: async (from, to, channelId) => {
      const map = new Map<string, { cost: number; calls: number }>();
      for (const u of this.t.usage.filter(
        (x) => x.createdAt >= from && x.createdAt < to && (!channelId || x.channelId === channelId),
      )) {
        const entry = map.get(u.provider) ?? { cost: 0, calls: 0 };
        entry.cost += u.actualCost || u.estimatedCost;
        entry.calls += 1;
        map.set(u.provider, entry);
      }
      return [...map.entries()]
        .map(([provider, v]) => ({ provider, cost: round(v.cost), calls: v.calls }))
        .sort((a, b) => b.cost - a.cost);
    },
    listRecent: async (limit, channelId) =>
      sortBy(
        this.t.usage.filter((u) => !channelId || u.channelId === channelId),
        (u) => u.createdAt.getTime(),
        'desc',
      ).slice(0, limit),
    totalCost: async (from, to) =>
      round(
        this.t.usage
          .filter((u) => u.createdAt >= from && u.createdAt < to)
          .reduce((sum, u) => sum + (u.actualCost || u.estimatedCost), 0),
      ),
  };

  readonly agentRuns: P.AgentRunRepository = {
    record: async (data) => this.t.agentRuns.insert({ createdAt: this.clock.now(), ...data }),
    listByVideo: async (videoId) =>
      sortBy(this.t.agentRuns.filter((a) => a.videoId === videoId), (a) => a.createdAt.getTime()),
    statsByPrompt: async (name) => {
      const map = new Map<number, { runs: number; ok: number; latency: number; cost: number }>();
      for (const run of this.t.agentRuns.filter((a) => a.promptName === name)) {
        const entry = map.get(run.promptVersion) ?? { runs: 0, ok: 0, latency: 0, cost: 0 };
        entry.runs += 1;
        entry.ok += run.ok ? 1 : 0;
        entry.latency += run.latencyMs;
        entry.cost += run.costUsd;
        map.set(run.promptVersion, entry);
      }
      return [...map.entries()]
        .map(([version, v]) => ({
          version,
          runs: v.runs,
          okRate: round(v.ok / v.runs, 3),
          avgLatencyMs: Math.round(v.latency / v.runs),
          avgCost: round(v.cost / v.runs, 6),
        }))
        .sort((a, b) => a.version - b.version);
    },
  };

  readonly decisions: P.DecisionRepository = {
    record: async (data) => this.t.decisions.insert({ createdAt: this.clock.now(), ...data }),
    listByVideo: async (videoId) =>
      sortBy(this.t.decisions.filter((d) => d.videoId === videoId), (d) => d.createdAt.getTime()),
    listByChannel: async (channelId, limit = 100) =>
      sortBy(this.t.decisions.filter((d) => d.channelId === channelId), (d) => d.createdAt.getTime(), 'desc').slice(
        0,
        limit,
      ),
  };

  readonly jobs: P.JobRepository = {
    create: async (data) => this.t.jobs.insert({ ...this.stamps(), ...data }),
    findById: async (id) => this.t.jobs.get(id),
    update: async (id, patch) => this.t.jobs.update(id, { ...patch, updatedAt: this.clock.now() }),
    listByVideo: async (videoId) =>
      sortBy(this.t.jobs.filter((j) => j.videoId === videoId), (j) => j.createdAt.getTime()),
    listByState: async (state, limit = 100) => {
      const wanted = ([] as JobState[]).concat(state);
      return sortBy(this.t.jobs.filter((j) => wanted.includes(j.state)), (j) => j.createdAt.getTime()).slice(0, limit);
    },
    countByState: async () => {
      const out: Record<string, number> = {};
      for (const j of this.t.jobs.all()) out[j.state] = (out[j.state] ?? 0) + 1;
      return out;
    },
    recordError: async (data) => this.t.jobErrors.insert({ createdAt: this.clock.now(), ...data }),
    listErrors: async (limit) =>
      // Attempt number breaks the tie when two errors land in the same millisecond, so the
      // admin screen shows the latest attempt first rather than an arbitrary one.
      this.t.jobErrors
        .all()
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.attempt - a.attempt)
        .slice(0, limit),
  };

  readonly rules: P.RuleRepository = {
    create: async (data) => this.t.rules.insert({ ...this.stamps(), ...data }),
    listByChannel: async (channelId) =>
      sortBy(this.t.rules.filter((r) => r.channelId === channelId), (r) => r.priority),
    update: async (id, patch) => this.t.rules.update(id, { ...patch, updatedAt: this.clock.now() }),
    delete: async (id) => this.t.rules.delete(id),
  };

  readonly notifications: P.NotificationRepository = {
    create: async (data) => this.t.notifications.insert({ createdAt: this.clock.now(), ...data }),
    listByUser: async (userId) => this.t.notifications.filter((n) => n.userId === userId),
    listForEvent: async (userId, event) =>
      this.t.notifications.filter(
        (n) => n.userId === userId && n.enabled && (n.events.length === 0 || n.events.includes(event)),
      ),
    findByKindTarget: async (kind, target) =>
      this.t.notifications.find((n) => n.kind === kind && n.target === target),
    delete: async (id) => this.t.notifications.delete(id),
  };

  readonly characters: P.CharacterRepository = {
    upsert: async (channelId, data) => {
      const existing = this.t.characters.find((c) => c.channelId === channelId && c.name === data.name);
      if (existing) return this.t.characters.update(existing.id, { ...data, updatedAt: this.clock.now() });
      return this.t.characters.insert({ ...this.stamps(), ...data, channelId });
    },
    listByChannel: async (channelId) => this.t.characters.filter((c) => c.channelId === channelId),
  };

  readonly music: P.MusicRepository = {
    create: async (data) => this.t.music.insert({ createdAt: this.clock.now(), ...data }),
    list: async () => this.t.music.all(),
    findByMood: async (mood, minDurationSec) => {
      const exact = this.t.music.filter(
        (m) => m.mood.toLowerCase() === mood.toLowerCase() && m.durationSec >= minDurationSec,
      );
      if (exact.length) return exact[0] ?? null;
      const any = this.t.music.filter((m) => m.durationSec >= minDurationSec);
      return any[0] ?? null;
    },
  };

  readonly providerCredentials: P.ProviderCredentialRepository = {
    upsert: async (userId, providerKey, ciphertext, hint) => {
      const existing = this.t.providerCredentials.find(
        (c) => c.userId === userId && c.providerKey === providerKey,
      );
      if (existing) {
        return this.t.providerCredentials.update(existing.id, {
          ciphertext,
          hint: hint ?? null,
          updatedAt: this.clock.now(),
        });
      }
      return this.t.providerCredentials.insert({
        ...this.stamps(),
        userId,
        providerKey,
        ciphertext,
        hint: hint ?? null,
      });
    },
    listByUser: async (userId) => this.t.providerCredentials.filter((c) => c.userId === userId),
    find: async (userId, providerKey) =>
      this.t.providerCredentials.find((c) => c.userId === userId && c.providerKey === providerKey),
    delete: async (userId, providerKey) => {
      this.t.providerCredentials.deleteWhere((c) => c.userId === userId && c.providerKey === providerKey);
    },
  };
}

function round(n: number, digits = 6): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
