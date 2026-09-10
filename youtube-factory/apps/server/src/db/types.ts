import type {
  AssetKind,
  AutomationMode,
  ClaimVerdict,
  IdeaStatus,
  JobState,
  Platform,
  Role,
  SceneStrategy,
  SourceKind,
  UploadState,
  VideoStatus,
} from '../shared/types.js';

/**
 * Persistence records. These are plain data — the domain never sees a Prisma model, which
 * is what lets the whole pipeline run against the in-memory repositories in tests.
 */

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  name?: string | null;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  userAgent?: string | null;
  ip?: string | null;
  expiresAt: Date;
  revokedAt?: Date | null;
  createdAt: Date;
}

export interface ChannelRecord {
  id: string;
  userId: string;
  platform: Platform;
  youtubeChannelId?: string | null;
  name: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  subscriberCount?: number | null;
  videoCount?: number | null;
  viewCount?: number | null;
  statsFetchedAt?: Date | null;
  enabled: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChannelSettingsRecord {
  id: string;
  channelId: string;
  niche: string;
  language: string;
  targetAudience: string;
  contentStyle: string;
  targetDurationMin: number;
  videosPerWeek: number;
  automationMode: AutomationMode;
  autopilotEnabled: boolean;
  autopilotRunAt: string;
  timezone: string;
  defaultPublishTime: string;
  publishDays: number[];
  privacyStatus: string;
  voiceProviderId?: string | null;
  voiceId?: string | null;
  voiceSettings?: Record<string, unknown> | null;
  visualStyle: string;
  thumbnailStyle: string;
  musicMood: string;
  monthlyBudgetUsd: number;
  minIdeaScore: number;
  minQcScore: number;
  minFactConfidence: number;
  minRetentionScore: number;
  maxCostPerVideoUsd: number;
  ideaWeights?: Record<string, number> | null;
  bufferTargetVideos: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface OAuthAccountRecord {
  id: string;
  channelId: string;
  provider: string;
  externalAccountId?: string | null;
  /** AES-256-GCM ciphertext — never a bearer token in the clear. */
  accessToken: string;
  refreshToken?: string | null;
  scope: string;
  tokenType: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompetitorChannelRecord {
  id: string;
  channelId: string;
  youtubeChannelId: string;
  name: string;
  subscriberCount?: number | null;
  uploadFrequency?: number | null;
  avgViews?: number | null;
  avgDurationSec?: number | null;
  lastAnalyzedAt?: Date | null;
  snapshot?: Record<string, unknown> | null;
  createdAt: Date;
}

export interface DiscoverySourceRecord {
  id: string;
  channelId: string;
  kind: SourceKind;
  label: string;
  target: string;
  enabled: boolean;
  lastRunAt?: Date | null;
  createdAt: Date;
}

export interface TrendSignalRecord {
  id: string;
  sourceId: string;
  channelId: string;
  kind: SourceKind;
  topic: string;
  url?: string | null;
  score: number;
  velocity?: number | null;
  raw?: Record<string, unknown> | null;
  observedAt: Date;
}

export interface ContentIdeaRecord {
  id: string;
  channelId: string;
  title: string;
  topic: string;
  angle: string;
  hook: string;
  targetAudience: string;
  rationale?: string | null;
  status: IdeaStatus;
  estimatedDemand: number;
  competition: number;
  novelty: number;
  evergreenScore: number;
  trendScore: number;
  productionCostUsd: number;
  estimatedCtr: number;
  estimatedRetention: number;
  overallScore: number;
  scoreBreakdown?: Record<string, unknown> | null;
  sourceSignals?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VideoRecord {
  id: string;
  channelId: string;
  ideaId?: string | null;
  templateId?: string | null;
  title: string;
  status: VideoStatus;
  previousStatus?: VideoStatus | null;
  progress?: Record<string, number> | null;
  targetDurationSec: number;
  actualDurationSec?: number | null;
  language: string;
  renderKey?: string | null;
  renderWidth?: number | null;
  renderHeight?: number | null;
  fileSizeBytes?: number | null;
  qualityScore?: number | null;
  qualityBreakdown?: Record<string, number> | null;
  factConfidence?: number | null;
  retentionScore?: number | null;
  estimatedCostUsd: number;
  actualCostUsd: number;
  failureReason?: string | null;
  publishAt?: Date | null;
  publishedAt?: Date | null;
  youtubeVideoId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResearchRecord {
  id: string;
  videoId: string;
  topic: string;
  summary: string;
  depth: string;
  confidence: number;
  openQuestions?: string[] | null;
  createdAt: Date;
}

export interface ResearchSourceRecord {
  id: string;
  researchId: string;
  claim: string;
  source: string;
  sourceUrl?: string | null;
  sourceType: string;
  publishedAt?: Date | null;
  confidence: number;
  verdict: ClaimVerdict;
  notes?: string | null;
}

export interface ScriptSectionRecord {
  heading: string;
  narration: string;
  purpose?: string;
  targetSeconds: number;
  patternInterrupt?: string;
}

export interface ScriptRecord {
  id: string;
  videoId: string;
  structure: string;
  hook: string;
  intro: string;
  sections: ScriptSectionRecord[];
  cta: string;
  wordCount: number;
  estimatedDuration: number;
  retentionScore?: number | null;
  retentionNotes?: unknown;
  factCheckScore?: number | null;
  factCheckReport?: unknown;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SceneRecord {
  id: string;
  videoId: string;
  index: number;
  durationSec: number;
  narration: string;
  visualBrief: string;
  prompt: string;
  negativePrompt?: string | null;
  camera?: string | null;
  style?: string | null;
  aspectRatio: string;
  characters: string[];
  location?: string | null;
  lighting?: string | null;
  motion?: string | null;
  continuityNotes?: string | null;
  textOverlay?: string | null;
  sfx?: string | null;
  importance: number;
  strategy: SceneStrategy;
  assetId?: string | null;
  createdAt: Date;
}

export interface AssetRecord {
  id: string;
  videoId?: string | null;
  kind: AssetKind;
  storageKey: string;
  mimeType: string;
  bytes?: number | null;
  durationSec?: number | null;
  width?: number | null;
  height?: number | null;
  provider?: string | null;
  externalId?: string | null;
  costUsd: number;
  license?: string | null;
  attribution?: string | null;
  checksum?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
}

export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

export interface VoiceoverRecord {
  id: string;
  videoId: string;
  index: number;
  text: string;
  storageKey: string;
  durationSec: number;
  provider: string;
  voiceId: string;
  wordTimings?: WordTiming[] | null;
  costUsd: number;
  createdAt: Date;
}

export interface TimelineRecord {
  id: string;
  videoId: string;
  document: unknown;
  renderCmd?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ThumbnailRecord {
  id: string;
  videoId: string;
  variant: string;
  concept: string;
  prompt: string;
  storageKey?: string | null;
  ctrPotential: number;
  selected: boolean;
  provider?: string | null;
  costUsd: number;
  createdAt: Date;
}

export interface SeoChapter {
  startSec: number;
  title: string;
}

export interface SeoMetadataRecord {
  id: string;
  videoId: string;
  title: string;
  titleCandidates: unknown;
  description: string;
  tags: string[];
  hashtags: string[];
  keywords: string[];
  chapters: SeoChapter[];
  categoryId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface QcReportRecord {
  id: string;
  videoId: string;
  passed: boolean;
  score: number;
  checks: unknown;
  failures: unknown;
  repairs?: unknown;
  createdAt: Date;
}

export interface UploadRecord {
  id: string;
  videoId: string;
  state: UploadState;
  privacyStatus: string;
  youtubeVideoId?: string | null;
  resumableUri?: string | null;
  bytesUploaded: number;
  error?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduleSlotRecord {
  id: string;
  channelId: string;
  videoId?: string | null;
  publishAt: Date;
  timezone: string;
  reserved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnalyticsSnapshotRecord {
  id: string;
  videoId: string;
  capturedAt: Date;
  views: number;
  watchTimeMinutes: number;
  averageViewDuration: number;
  averageViewPercentage: number;
  impressions: number;
  ctr: number;
  likes: number;
  comments: number;
  shares: number;
  subscribersGained: number;
  estimatedRevenueUsd?: number | null;
  raw?: Record<string, unknown> | null;
}

export interface LearningRecord {
  id: string;
  channelId: string;
  videoId?: string | null;
  dimension: string;
  observation: string;
  predicted?: number | null;
  actual?: number | null;
  delta?: number | null;
  weight: number;
  createdAt: Date;
}

export interface StrategyPlanRecord {
  id: string;
  channelId: string;
  weekStart: Date;
  summary: string;
  recommendations: unknown;
  mix: unknown;
  createdAt: Date;
}

export interface ContentTemplateRecord {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  scriptStructure: unknown;
  visualStyle: string;
  voiceProfile?: Record<string, unknown> | null;
  musicMood?: string | null;
  sceneDurationSec: number;
  thumbnailStyle?: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PromptTemplateRecord {
  id: string;
  userId?: string | null;
  name: string;
  version: number;
  provider?: string | null;
  systemPrompt: string;
  userTemplate: string;
  variables: string[];
  active: boolean;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProviderRecord {
  id: string;
  key: string;
  name: string;
  capabilities: string[];
  enabled: boolean;
  priority: number;
  config?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiUsageRecord {
  id: string;
  channelId?: string | null;
  videoId?: string | null;
  jobId?: string | null;
  provider: string;
  operation: string;
  model?: string | null;
  inputUnits: number;
  outputUnits: number;
  unit: string;
  estimatedCost: number;
  actualCost: number;
  latencyMs: number;
  status: string;
  error?: string | null;
  createdAt: Date;
}

export interface AgentRunRecord {
  id: string;
  videoId?: string | null;
  agent: string;
  promptId?: string | null;
  promptName: string;
  promptVersion: number;
  provider: string;
  model?: string | null;
  ok: boolean;
  attempts: number;
  latencyMs: number;
  costUsd: number;
  input?: unknown;
  output?: unknown;
  error?: string | null;
  createdAt: Date;
}

export interface DecisionLogRecord {
  id: string;
  videoId?: string | null;
  channelId?: string | null;
  subject: string;
  decision: string;
  reason: string;
  score?: number | null;
  dataUsed?: Record<string, unknown> | null;
  createdAt: Date;
}

export interface JobRecord {
  id: string;
  queue: string;
  name: string;
  channelId?: string | null;
  videoId?: string | null;
  state: JobState;
  payload: Record<string, unknown>;
  attemptCount: number;
  maxAttempts: number;
  lastError?: string | null;
  retryAt?: Date | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobErrorRecord {
  id: string;
  jobId: string;
  attempt: number;
  message: string;
  stack?: string | null;
  provider?: string | null;
  createdAt: Date;
}

export interface AutomationRuleRecord {
  id: string;
  channelId: string;
  name: string;
  condition: { metric: string; op: 'gt' | 'gte' | 'lt' | 'lte' | 'eq'; value: number };
  action: { type: string; [key: string]: unknown };
  enabled: boolean;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationTargetRecord {
  id: string;
  userId: string;
  kind: string;
  target: string;
  events: string[];
  enabled: boolean;
  createdAt: Date;
}

export interface CharacterProfileRecord {
  id: string;
  channelId: string;
  name: string;
  age?: string | null;
  gender?: string | null;
  clothing?: string | null;
  hair?: string | null;
  face?: string | null;
  bodyType?: string | null;
  style?: string | null;
  referenceKey?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MusicTrackRecord {
  id: string;
  title: string;
  source: string;
  license: string;
  attribution?: string | null;
  durationSec: number;
  mood: string;
  storageKey: string;
  bpm?: number | null;
  createdAt: Date;
}

export interface ProviderCredentialRecord {
  id: string;
  userId: string;
  providerKey: string;
  ciphertext: string;
  hint?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
