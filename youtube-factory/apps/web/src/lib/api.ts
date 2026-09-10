/**
 * Typed client for the factory API. Every call carries the session cookie, and errors come
 * back as a single ApiError shape so screens can render one message rather than guessing.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'network_error', `Could not reach the API at ${API_URL}. Is the server running?`);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const body = text ? safeJson(text) : {};

  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string; details?: unknown } }).error;
    throw new ApiError(
      response.status,
      error?.code ?? 'error',
      error?.message ?? `Request failed with status ${response.status}`,
      error?.details,
    );
  }
  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

// ── shared response types ────────────────────────────────────────────────────

export type VideoStatus =
  | 'IDEA' | 'RESEARCHING' | 'RESEARCH_COMPLETE' | 'SCRIPTING' | 'SCRIPT_READY' | 'FACT_CHECK'
  | 'SCENE_PLANNING' | 'GENERATING_VISUALS' | 'GENERATING_VOICE' | 'EDITING' | 'QC'
  | 'THUMBNAIL' | 'SEO' | 'READY' | 'SCHEDULED' | 'PUBLISHED' | 'ANALYZING' | 'FAILED';

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'USER' | 'ADMIN';
  createdAt: string;
}

export interface ChannelSummary {
  id: string;
  name: string;
  isDefault: boolean;
  enabled: boolean;
}

export interface ChannelSettings {
  channelId: string;
  niche: string;
  language: string;
  targetAudience: string;
  contentStyle: string;
  targetDurationMin: number;
  videosPerWeek: number;
  automationMode: 'FULL_AUTO' | 'SEMI_AUTO' | 'MANUAL';
  autopilotEnabled: boolean;
  autopilotRunAt: string;
  timezone: string;
  defaultPublishTime: string;
  publishDays: number[];
  privacyStatus: string;
  voiceId: string | null;
  visualStyle: string;
  thumbnailStyle: string;
  musicMood: string;
  monthlyBudgetUsd: number;
  minIdeaScore: number;
  minQcScore: number;
  minFactConfidence: number;
  minRetentionScore: number;
  maxCostPerVideoUsd: number;
  bufferTargetVideos: number;
}

export interface Channel {
  id: string;
  name: string;
  youtubeChannelId: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  subscriberCount: number | null;
  videoCount: number | null;
  viewCount: number | null;
  enabled: boolean;
  isDefault: boolean;
  settings?: ChannelSettings | null;
  connected?: boolean;
}

export interface BudgetStatus {
  budgetUsd: number;
  spentUsd: number;
  remainingUsd: number;
  utilisation: number;
  level: 'ok' | 'warning' | 'critical' | 'exceeded';
  blocked: boolean;
  projectedMonthEndUsd: number;
}

export interface Idea {
  id: string;
  channelId: string;
  title: string;
  topic: string;
  angle: string;
  hook: string;
  targetAudience: string;
  rationale: string | null;
  status: 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'IN_PRODUCTION' | 'PRODUCED';
  estimatedDemand: number;
  competition: number;
  novelty: number;
  evergreenScore: number;
  trendScore: number;
  estimatedCtr: number;
  estimatedRetention: number;
  productionCostUsd: number;
  overallScore: number;
  scoreBreakdown: { contributions?: Record<string, number> } | null;
  createdAt: string;
}

export interface VideoSummary {
  id: string;
  channelId: string;
  title: string;
  status: VideoStatus;
  progress: Record<string, number> | null;
  completion: number;
  targetDurationSec: number;
  actualDurationSec: number | null;
  qualityScore: number | null;
  factConfidence: number | null;
  retentionScore: number | null;
  actualCostUsd: number;
  failureReason: string | null;
  publishAt: string | null;
  publishedAt: string | null;
  youtubeVideoId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Stage {
  status: VideoStatus;
  label: string;
  group: string;
  percent: number;
  reached: boolean;
}

export interface Overview {
  channel: { id: string; name: string; youtubeChannelId: string | null; subscriberCount: number | null };
  settings: { automationMode: string; autopilotEnabled: boolean; videosPerWeek: number };
  thisWeek: { created: number; published: number; scheduled: number };
  metrics: {
    views: number; watchTimeMinutes: number; impressions: number; ctr: number;
    averageViewDuration: number; subscribersGained: number; estimatedRevenueUsd: number; videosMeasured: number;
  };
  topVideo: { id: string; title: string; views: number; ctr: number } | null;
  worstVideo: { id: string; title: string; views: number; ctr: number } | null;
  pipeline: {
    counts: Record<string, number>;
    buffer: { published7d: number; scheduled: number; ready: number; inProduction: number; deficit: number; target: number };
    inFlight: Array<{ id: string; title: string; status: VideoStatus; progress: Record<string, number>; updatedAt: string }>;
  };
  budget: BudgetStatus;
  upcomingSlots: string[];
}
