/**
 * Domain enums. These are duplicated (deliberately) from the Prisma schema so that the
 * domain layer never imports the database client — the in-memory repositories and the
 * offline pipeline run with no Prisma present at all.
 */

export const VIDEO_STATUSES = [
  'IDEA',
  'RESEARCHING',
  'RESEARCH_COMPLETE',
  'SCRIPTING',
  'SCRIPT_READY',
  'FACT_CHECK',
  'SCENE_PLANNING',
  'GENERATING_VISUALS',
  'GENERATING_VOICE',
  'EDITING',
  'QC',
  'THUMBNAIL',
  'SEO',
  'READY',
  'SCHEDULED',
  'PUBLISHED',
  'ANALYZING',
  'FAILED',
] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

/** Order used by the progress UI (spec §70). FAILED is terminal and excluded. */
export const PIPELINE_ORDER: VideoStatus[] = VIDEO_STATUSES.filter((s) => s !== 'FAILED');

export const AUTOMATION_MODES = ['FULL_AUTO', 'SEMI_AUTO', 'MANUAL'] as const;
export type AutomationMode = (typeof AUTOMATION_MODES)[number];

export const IDEA_STATUSES = ['PROPOSED', 'APPROVED', 'REJECTED', 'IN_PRODUCTION', 'PRODUCED'] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

export const SCENE_STRATEGIES = ['STOCK', 'IMAGE_MOTION', 'GENERATED_VIDEO', 'EXISTING_MEDIA'] as const;
export type SceneStrategy = (typeof SCENE_STRATEGIES)[number];

export const ASSET_KINDS = ['IMAGE', 'VIDEO', 'AUDIO', 'MUSIC', 'SFX', 'THUMBNAIL', 'CAPTION', 'RENDER'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const CLAIM_VERDICTS = ['SUPPORTED', 'UNVERIFIED', 'CONTRADICTED'] as const;
export type ClaimVerdict = (typeof CLAIM_VERDICTS)[number];

export const JOB_STATES = ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'WAITING_APPROVAL'] as const;
export type JobState = (typeof JOB_STATES)[number];

export const UPLOAD_STATES = ['PENDING', 'UPLOADING', 'PROCESSING', 'COMPLETE', 'FAILED'] as const;
export type UploadState = (typeof UPLOAD_STATES)[number];

export const SOURCE_KINDS = [
  'YOUTUBE',
  'GOOGLE_TRENDS',
  'REDDIT',
  'RSS',
  'NEWS_API',
  'WIKIPEDIA',
  'WEBSITE',
  'MANUAL',
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const PLATFORMS = ['YOUTUBE', 'TIKTOK', 'INSTAGRAM', 'X', 'FACEBOOK', 'PODCAST'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const ROLES = ['USER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const CAPABILITIES = [
  'generateText',
  'generateStructuredOutput',
  'analyzeText',
  'research',
  'generateImage',
  'generateVideo',
  'generateVoice',
  'generateMusic',
  'publish',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const AGENT_NAMES = [
  'RESEARCH_AGENT',
  'IDEA_AGENT',
  'COMPETITOR_AGENT',
  'SCRIPT_AGENT',
  'FACT_CHECK_AGENT',
  'RETENTION_AGENT',
  'SCENE_AGENT',
  'VISUAL_AGENT',
  'VOICE_AGENT',
  'EDITING_AGENT',
  'THUMBNAIL_AGENT',
  'SEO_AGENT',
  'QC_AGENT',
  'ANALYTICS_AGENT',
  'STRATEGY_AGENT',
  'DECISION_AGENT',
] as const;
export type AgentName = (typeof AGENT_NAMES)[number];

export const NOTIFICATION_EVENTS = [
  'IDEA_READY',
  'SCRIPT_READY',
  'VIDEO_READY',
  'UPLOAD_SUCCESS',
  'UPLOAD_FAILED',
  'BUDGET_WARNING',
  'BUDGET_EXCEEDED',
  'QC_FAILED',
  'WEEKLY_REPORT',
  'PIPELINE_FAILED',
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

/** A decision the system made on the user's behalf — always explainable (spec §79). */
export interface Decision {
  subject: string;
  decision: string;
  reason: string;
  score?: number;
  dataUsed?: Record<string, unknown>;
}

export interface Money {
  /** US dollars. Kept as a float because provider rate cards are quoted that way. */
  usd: number;
}

export const zero: Money = { usd: 0 };
export const usd = (n: number): Money => ({ usd: Math.round(n * 1e6) / 1e6 });
export const addMoney = (...items: Money[]): Money =>
  usd(items.reduce((sum, m) => sum + m.usd, 0));
