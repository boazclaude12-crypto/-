import type {
  AgentRunRecord,
  AnalyticsSnapshotRecord,
  ApiUsageRecord,
  AssetRecord,
  AutomationRuleRecord,
  ChannelRecord,
  ChannelSettingsRecord,
  CharacterProfileRecord,
  CompetitorChannelRecord,
  ContentIdeaRecord,
  ContentTemplateRecord,
  DecisionLogRecord,
  DiscoverySourceRecord,
  JobErrorRecord,
  JobRecord,
  LearningRecord,
  MusicTrackRecord,
  NotificationTargetRecord,
  OAuthAccountRecord,
  PromptTemplateRecord,
  ProviderCredentialRecord,
  QcReportRecord,
  ResearchRecord,
  ResearchSourceRecord,
  SceneRecord,
  ScheduleSlotRecord,
  ScriptRecord,
  SeoMetadataRecord,
  SessionRecord,
  StrategyPlanRecord,
  ThumbnailRecord,
  TimelineRecord,
  TrendSignalRecord,
  UploadRecord,
  UserRecord,
  VideoRecord,
  VoiceoverRecord,
} from './types.js';
import type { IdeaStatus, JobState, VideoStatus } from '../shared/types.js';

export type New<T, K extends keyof T = never> = Omit<T, 'id' | 'createdAt' | 'updatedAt' | K> &
  Partial<Pick<T, Extract<'id' | 'createdAt' | 'updatedAt', keyof T>>>;

export interface Page<T> {
  items: T[];
  total: number;
}

export interface UserRepository {
  create(data: New<UserRecord>): Promise<UserRecord>;
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  update(id: string, patch: Partial<UserRecord>): Promise<UserRecord>;
  count(): Promise<number>;
  list(limit?: number): Promise<UserRecord[]>;
}

export interface SessionRepository {
  create(data: New<SessionRecord>): Promise<SessionRecord>;
  findByTokenHash(hash: string): Promise<SessionRecord | null>;
  revoke(id: string, at: Date): Promise<void>;
  revokeAllForUser(userId: string, at: Date): Promise<void>;
  deleteExpired(before: Date): Promise<number>;
}

export interface ChannelRepository {
  create(data: New<ChannelRecord>): Promise<ChannelRecord>;
  findById(id: string): Promise<ChannelRecord | null>;
  findByYoutubeId(userId: string, youtubeChannelId: string): Promise<ChannelRecord | null>;
  listByUser(userId: string): Promise<ChannelRecord[]>;
  listEnabled(): Promise<ChannelRecord[]>;
  update(id: string, patch: Partial<ChannelRecord>): Promise<ChannelRecord>;
  delete(id: string): Promise<void>;
  clearDefault(userId: string): Promise<void>;
  count(): Promise<number>;
}

export interface ChannelSettingsRepository {
  upsert(channelId: string, data: Omit<New<ChannelSettingsRecord>, 'channelId'>): Promise<ChannelSettingsRecord>;
  findByChannel(channelId: string): Promise<ChannelSettingsRecord | null>;
  update(channelId: string, patch: Partial<ChannelSettingsRecord>): Promise<ChannelSettingsRecord>;
}

export interface OAuthRepository {
  upsert(data: New<OAuthAccountRecord>): Promise<OAuthAccountRecord>;
  findByChannel(channelId: string): Promise<OAuthAccountRecord | null>;
  deleteByChannel(channelId: string): Promise<void>;
}

export interface CompetitorRepository {
  create(data: New<CompetitorChannelRecord>): Promise<CompetitorChannelRecord>;
  listByChannel(channelId: string): Promise<CompetitorChannelRecord[]>;
  update(id: string, patch: Partial<CompetitorChannelRecord>): Promise<CompetitorChannelRecord>;
  delete(id: string): Promise<void>;
}

export interface DiscoveryRepository {
  createSource(data: New<DiscoverySourceRecord>): Promise<DiscoverySourceRecord>;
  listSources(channelId: string): Promise<DiscoverySourceRecord[]>;
  updateSource(id: string, patch: Partial<DiscoverySourceRecord>): Promise<DiscoverySourceRecord>;
  deleteSource(id: string): Promise<void>;
  recordSignals(signals: New<TrendSignalRecord>[]): Promise<TrendSignalRecord[]>;
  recentSignals(channelId: string, since: Date, limit?: number): Promise<TrendSignalRecord[]>;
}

export interface IdeaRepository {
  createMany(data: New<ContentIdeaRecord>[]): Promise<ContentIdeaRecord[]>;
  findById(id: string): Promise<ContentIdeaRecord | null>;
  listByChannel(channelId: string, filter?: { status?: IdeaStatus; limit?: number }): Promise<ContentIdeaRecord[]>;
  update(id: string, patch: Partial<ContentIdeaRecord>): Promise<ContentIdeaRecord>;
  delete(id: string): Promise<void>;
  /** Highest-scoring approved-or-proposed idea not yet in production. */
  bestCandidate(channelId: string, minScore: number, allowProposed: boolean): Promise<ContentIdeaRecord | null>;
}

export interface VideoRepository {
  create(data: New<VideoRecord>): Promise<VideoRecord>;
  findById(id: string): Promise<VideoRecord | null>;
  update(id: string, patch: Partial<VideoRecord>): Promise<VideoRecord>;
  delete(id: string): Promise<void>;
  listByChannel(
    channelId: string,
    filter?: { status?: VideoStatus | VideoStatus[]; limit?: number; offset?: number },
  ): Promise<Page<VideoRecord>>;
  listByStatus(status: VideoStatus | VideoStatus[], limit?: number): Promise<VideoRecord[]>;
  listDueForPublish(now: Date, limit?: number): Promise<VideoRecord[]>;
  listPublishedSince(channelId: string, since: Date): Promise<VideoRecord[]>;
  countByStatus(channelId: string): Promise<Record<string, number>>;
  count(): Promise<number>;
}

export interface ResearchRepository {
  upsert(videoId: string, data: Omit<New<ResearchRecord>, 'videoId'>, sources: Omit<New<ResearchSourceRecord>, 'researchId'>[]): Promise<ResearchRecord>;
  findByVideo(videoId: string): Promise<(ResearchRecord & { sources: ResearchSourceRecord[] }) | null>;
  updateSourceVerdicts(researchId: string, updates: Array<{ claim: string; verdict: ResearchSourceRecord['verdict']; confidence: number }>): Promise<void>;
}

export interface ScriptRepository {
  upsert(videoId: string, data: Omit<New<ScriptRecord>, 'videoId'>): Promise<ScriptRecord>;
  findByVideo(videoId: string): Promise<ScriptRecord | null>;
  update(videoId: string, patch: Partial<ScriptRecord>): Promise<ScriptRecord>;
}

export interface SceneRepository {
  replaceAll(videoId: string, scenes: Omit<New<SceneRecord>, 'videoId'>[]): Promise<SceneRecord[]>;
  listByVideo(videoId: string): Promise<SceneRecord[]>;
  update(id: string, patch: Partial<SceneRecord>): Promise<SceneRecord>;
}

export interface AssetRepository {
  create(data: New<AssetRecord>): Promise<AssetRecord>;
  findById(id: string): Promise<AssetRecord | null>;
  listByVideo(videoId: string, kind?: AssetRecord['kind']): Promise<AssetRecord[]>;
  findByChecksum(checksum: string): Promise<AssetRecord | null>;
  delete(id: string): Promise<void>;
}

export interface VoiceoverRepository {
  replaceAll(videoId: string, items: Omit<New<VoiceoverRecord>, 'videoId'>[]): Promise<VoiceoverRecord[]>;
  listByVideo(videoId: string): Promise<VoiceoverRecord[]>;
}

export interface TimelineRepository {
  upsert(videoId: string, document: unknown, renderCmd?: string): Promise<TimelineRecord>;
  findByVideo(videoId: string): Promise<TimelineRecord | null>;
}

export interface ThumbnailRepository {
  replaceAll(videoId: string, items: Omit<New<ThumbnailRecord>, 'videoId'>[]): Promise<ThumbnailRecord[]>;
  listByVideo(videoId: string): Promise<ThumbnailRecord[]>;
  select(videoId: string, variant: string): Promise<ThumbnailRecord>;
  update(id: string, patch: Partial<ThumbnailRecord>): Promise<ThumbnailRecord>;
}

export interface SeoRepository {
  upsert(videoId: string, data: Omit<New<SeoMetadataRecord>, 'videoId'>): Promise<SeoMetadataRecord>;
  findByVideo(videoId: string): Promise<SeoMetadataRecord | null>;
}

export interface QcRepository {
  create(data: New<QcReportRecord>): Promise<QcReportRecord>;
  latest(videoId: string): Promise<QcReportRecord | null>;
  listByVideo(videoId: string): Promise<QcReportRecord[]>;
}

export interface UploadRepository {
  upsert(videoId: string, data: Omit<New<UploadRecord>, 'videoId'>): Promise<UploadRecord>;
  findByVideo(videoId: string): Promise<UploadRecord | null>;
  update(videoId: string, patch: Partial<UploadRecord>): Promise<UploadRecord>;
}

export interface ScheduleRepository {
  create(data: New<ScheduleSlotRecord>): Promise<ScheduleSlotRecord>;
  findByVideo(videoId: string): Promise<ScheduleSlotRecord | null>;
  listByChannel(channelId: string, from: Date, to: Date): Promise<ScheduleSlotRecord[]>;
  listUpcoming(channelId: string, from: Date): Promise<ScheduleSlotRecord[]>;
  update(id: string, patch: Partial<ScheduleSlotRecord>): Promise<ScheduleSlotRecord>;
  release(videoId: string): Promise<void>;
}

export interface AnalyticsRepository {
  create(data: New<AnalyticsSnapshotRecord>): Promise<AnalyticsSnapshotRecord>;
  latestByVideo(videoId: string): Promise<AnalyticsSnapshotRecord | null>;
  listByVideo(videoId: string): Promise<AnalyticsSnapshotRecord[]>;
  latestForChannel(channelId: string, videoIds: string[]): Promise<AnalyticsSnapshotRecord[]>;
}

export interface LearningRepository {
  createMany(items: New<LearningRecord>[]): Promise<LearningRecord[]>;
  listByChannel(channelId: string, limit?: number): Promise<LearningRecord[]>;
}

export interface StrategyRepository {
  upsert(data: New<StrategyPlanRecord>): Promise<StrategyPlanRecord>;
  latest(channelId: string): Promise<StrategyPlanRecord | null>;
}

export interface ContentTemplateRepository {
  create(data: New<ContentTemplateRecord>): Promise<ContentTemplateRecord>;
  findById(id: string): Promise<ContentTemplateRecord | null>;
  listByUser(userId: string): Promise<ContentTemplateRecord[]>;
  update(id: string, patch: Partial<ContentTemplateRecord>): Promise<ContentTemplateRecord>;
  delete(id: string): Promise<void>;
}

export interface PromptRepository {
  create(data: New<PromptTemplateRecord>): Promise<PromptTemplateRecord>;
  /** Active version of a prompt, preferring a user-specific override over the system one. */
  findActive(name: string, userId?: string | null): Promise<PromptTemplateRecord | null>;
  listVersions(name: string): Promise<PromptTemplateRecord[]>;
  list(): Promise<PromptTemplateRecord[]>;
  activate(id: string): Promise<PromptTemplateRecord>;
  update(id: string, patch: Partial<PromptTemplateRecord>): Promise<PromptTemplateRecord>;
}

export interface UsageRepository {
  record(data: New<ApiUsageRecord>): Promise<ApiUsageRecord>;
  sumForChannel(channelId: string, from: Date, to: Date): Promise<number>;
  sumForVideo(videoId: string): Promise<number>;
  breakdownByProvider(from: Date, to: Date, channelId?: string): Promise<Array<{ provider: string; cost: number; calls: number }>>;
  listRecent(limit: number, channelId?: string): Promise<ApiUsageRecord[]>;
  totalCost(from: Date, to: Date): Promise<number>;
}

export interface AgentRunRepository {
  record(data: New<AgentRunRecord>): Promise<AgentRunRecord>;
  listByVideo(videoId: string): Promise<AgentRunRecord[]>;
  statsByPrompt(name: string): Promise<Array<{ version: number; runs: number; okRate: number; avgLatencyMs: number; avgCost: number }>>;
}

export interface DecisionRepository {
  record(data: New<DecisionLogRecord>): Promise<DecisionLogRecord>;
  listByVideo(videoId: string): Promise<DecisionLogRecord[]>;
  listByChannel(channelId: string, limit?: number): Promise<DecisionLogRecord[]>;
}

export interface JobRepository {
  create(data: New<JobRecord>): Promise<JobRecord>;
  findById(id: string): Promise<JobRecord | null>;
  update(id: string, patch: Partial<JobRecord>): Promise<JobRecord>;
  listByVideo(videoId: string): Promise<JobRecord[]>;
  listByState(state: JobState | JobState[], limit?: number): Promise<JobRecord[]>;
  countByState(): Promise<Record<string, number>>;
  recordError(data: New<JobErrorRecord>): Promise<JobErrorRecord>;
  listErrors(limit: number): Promise<JobErrorRecord[]>;
}

export interface RuleRepository {
  create(data: New<AutomationRuleRecord>): Promise<AutomationRuleRecord>;
  listByChannel(channelId: string): Promise<AutomationRuleRecord[]>;
  update(id: string, patch: Partial<AutomationRuleRecord>): Promise<AutomationRuleRecord>;
  delete(id: string): Promise<void>;
}

export interface NotificationRepository {
  create(data: New<NotificationTargetRecord>): Promise<NotificationTargetRecord>;
  listByUser(userId: string): Promise<NotificationTargetRecord[]>;
  listForEvent(userId: string, event: string): Promise<NotificationTargetRecord[]>;
  findByKindTarget(kind: string, target: string): Promise<NotificationTargetRecord | null>;
  delete(id: string): Promise<void>;
}

export interface CharacterRepository {
  upsert(channelId: string, data: Omit<New<CharacterProfileRecord>, 'channelId'>): Promise<CharacterProfileRecord>;
  listByChannel(channelId: string): Promise<CharacterProfileRecord[]>;
}

export interface MusicRepository {
  create(data: New<MusicTrackRecord>): Promise<MusicTrackRecord>;
  list(): Promise<MusicTrackRecord[]>;
  findByMood(mood: string, minDurationSec: number): Promise<MusicTrackRecord | null>;
}

export interface ProviderCredentialRepository {
  upsert(userId: string, providerKey: string, ciphertext: string, hint?: string): Promise<ProviderCredentialRecord>;
  listByUser(userId: string): Promise<ProviderCredentialRecord[]>;
  find(userId: string, providerKey: string): Promise<ProviderCredentialRecord | null>;
  delete(userId: string, providerKey: string): Promise<void>;
}

/** Everything the domain can persist, in one injectable bundle. */
export interface Repositories {
  users: UserRepository;
  sessions: SessionRepository;
  channels: ChannelRepository;
  channelSettings: ChannelSettingsRepository;
  oauth: OAuthRepository;
  competitors: CompetitorRepository;
  discovery: DiscoveryRepository;
  ideas: IdeaRepository;
  videos: VideoRepository;
  research: ResearchRepository;
  scripts: ScriptRepository;
  scenes: SceneRepository;
  assets: AssetRepository;
  voiceovers: VoiceoverRepository;
  timelines: TimelineRepository;
  thumbnails: ThumbnailRepository;
  seo: SeoRepository;
  qc: QcRepository;
  uploads: UploadRepository;
  schedules: ScheduleRepository;
  analytics: AnalyticsRepository;
  learnings: LearningRepository;
  strategies: StrategyRepository;
  contentTemplates: ContentTemplateRepository;
  prompts: PromptRepository;
  usage: UsageRepository;
  agentRuns: AgentRunRepository;
  decisions: DecisionRepository;
  jobs: JobRepository;
  rules: RuleRepository;
  notifications: NotificationRepository;
  characters: CharacterRepository;
  music: MusicRepository;
  providerCredentials: ProviderCredentialRepository;
  /** Release any connection pool held by the implementation. */
  close(): Promise<void>;
}
