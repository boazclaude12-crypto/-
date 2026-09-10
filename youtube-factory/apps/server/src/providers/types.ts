import type { Capability, Money } from '../shared/types.js';

/**
 * Provider ports (spec §3). A provider implements only the capability mixins it supports;
 * `ProviderRegistry` narrows by capability before ever calling one.
 */

export type QualityTier = 'draft' | 'standard' | 'premium';

export interface OperationContext {
  jobId?: string;
  videoId?: string;
  channelId?: string;
  /** Essential operations bypass soft budget throttling but never a hard stop. */
  essential?: boolean;
  quality?: QualityTier;
  signal?: AbortSignal;
}

export interface Usage {
  inputUnits: number;
  outputUnits: number;
  unit: 'token' | 'character' | 'second' | 'image' | 'request';
  cost: Money;
  model?: string;
}

export interface ProviderHealth {
  ok: boolean;
  latencyMs?: number;
  detail?: string;
}

export interface AIProvider {
  readonly key: string;
  readonly name: string;
  readonly capabilities: readonly Capability[];
  /** False whenever credentials are absent — such a provider is never selected (spec §81). */
  isConfigured(): boolean;
  /** Environment variable names that are missing, for the Providers screen. */
  missingConfig(): string[];
  estimateCost(op: EstimateInput): Money;
  health(): Promise<ProviderHealth>;
}

export type EstimateInput =
  | { capability: 'generateText' | 'generateStructuredOutput' | 'analyzeText' | 'research'; inputTokens: number; outputTokens: number; quality?: QualityTier }
  | { capability: 'generateImage'; images: number; quality?: QualityTier }
  | { capability: 'generateVideo'; seconds: number; quality?: QualityTier }
  | { capability: 'generateVoice'; characters: number; quality?: QualityTier }
  | { capability: 'generateMusic'; seconds: number; quality?: QualityTier }
  | { capability: 'publish'; requests: number };

// ── text ─────────────────────────────────────────────────────────────────────

export interface TextRequest {
  system: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  quality?: QualityTier;
  stopSequences?: string[];
}

export interface TextResponse {
  text: string;
  usage: Usage;
}

export interface TextCapable {
  generateText(req: TextRequest, ctx?: OperationContext): Promise<TextResponse>;
}

export interface StructuredRequest {
  system: string;
  prompt: string;
  /** JSON Schema the response must satisfy. */
  schema: Record<string, unknown>;
  schemaName: string;
  maxTokens?: number;
  temperature?: number;
  quality?: QualityTier;
}

export interface StructuredResponse<T = unknown> {
  data: T;
  raw: string;
  usage: Usage;
}

export interface StructuredCapable {
  generateStructuredOutput<T = unknown>(
    req: StructuredRequest,
    ctx?: OperationContext,
  ): Promise<StructuredResponse<T>>;
}

// ── image ────────────────────────────────────────────────────────────────────

export interface ImageRequest {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  count?: number;
  style?: string;
  seed?: number;
  quality?: QualityTier;
  /** Optional reference image (URL) for style/character continuity. */
  referenceImageUrl?: string;
}

export interface GeneratedMedia {
  /** Present when the provider returns bytes directly. */
  bytes?: Buffer;
  /** Present when the provider returns a downloadable URL. */
  url?: string;
  mimeType: string;
  width?: number;
  height?: number;
  durationSec?: number;
  externalId?: string;
}

export interface ImageResponse {
  images: GeneratedMedia[];
  usage: Usage;
}

export interface ImageCapable {
  generateImage(req: ImageRequest, ctx?: OperationContext): Promise<ImageResponse>;
}

// ── video ────────────────────────────────────────────────────────────────────

export interface VideoRequest {
  prompt: string;
  negativePrompt?: string;
  /** Image-to-video is the supported path on every real vendor we integrate. */
  imageUrl?: string;
  durationSec: number;
  aspectRatio: string;
  motion?: string;
  seed?: number;
  quality?: QualityTier;
  webhookUrl?: string;
}

export interface VideoResponse {
  video: GeneratedMedia;
  usage: Usage;
}

export interface VideoCapable {
  generateVideo(req: VideoRequest, ctx?: OperationContext): Promise<VideoResponse>;
}

// ── voice ────────────────────────────────────────────────────────────────────

export interface VoiceSettings {
  stability?: number;
  similarityBoost?: number;
  style?: number;
  speed?: number;
  useSpeakerBoost?: boolean;
}

export interface VoiceRequest {
  text: string;
  voiceId: string;
  language?: string;
  modelId?: string;
  settings?: VoiceSettings;
  /** Continuity hints so consecutive segments do not sound stitched. */
  previousText?: string;
  nextText?: string;
  outputFormat?: string;
}

export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

export interface VoiceResponse {
  audio: Buffer;
  mimeType: string;
  durationSec: number;
  wordTimings: WordTiming[];
  usage: Usage;
}

export interface VoiceCapable {
  generateVoice(req: VoiceRequest, ctx?: OperationContext): Promise<VoiceResponse>;
  listVoices?(): Promise<Array<{ id: string; name: string; labels?: Record<string, string> }>>;
}

// ── music ────────────────────────────────────────────────────────────────────

export interface MusicRequest {
  mood: string;
  durationSec: number;
  bpm?: number;
  prompt?: string;
}

export interface MusicResponse {
  audio: GeneratedMedia;
  title: string;
  license: string;
  attribution?: string;
  usage: Usage;
}

export interface MusicCapable {
  generateMusic(req: MusicRequest, ctx?: OperationContext): Promise<MusicResponse>;
}

// ── publishing ───────────────────────────────────────────────────────────────

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  scope: string;
  tokenType: string;
}

export interface RemoteChannel {
  id: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  subscriberCount?: number;
  videoCount?: number;
  viewCount?: number;
  uploadsPlaylistId?: string;
}

export interface RemoteVideo {
  id: string;
  title: string;
  publishedAt?: string;
  durationSec?: number;
  views?: number;
  likes?: number;
  comments?: number;
  thumbnailUrl?: string;
}

export interface UploadRequest {
  filePath: string;
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  privacyStatus: 'private' | 'unlisted' | 'public';
  publishAt?: Date;
  language?: string;
  madeForKids?: boolean;
  onProgress?: (bytesUploaded: number, totalBytes: number) => void;
}

export interface UploadResult {
  videoId: string;
  uploadStatus: string;
  privacyStatus: string;
}

export interface VideoMetrics {
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
  estimatedRevenueUsd?: number;
  raw?: Record<string, unknown>;
}

/**
 * Publishing port (spec §86). YouTube is one implementation; adding TikTok or Reels means
 * adding an adapter here, not touching the pipeline.
 */
export interface PublishingProvider extends AIProvider {
  authorizeUrl(state: string, extraScopes?: string[]): string;
  exchangeCode(code: string): Promise<OAuthTokens>;
  refresh(refreshToken: string): Promise<OAuthTokens>;
  revoke(token: string): Promise<void>;
  getChannel(accessToken: string): Promise<RemoteChannel>;
  listChannelVideos(accessToken: string, channelId: string, limit?: number): Promise<RemoteVideo[]>;
  /** Public data for competitor analysis — uses the API key, not a user's token. */
  lookupPublicChannel(channelId: string): Promise<RemoteChannel | null>;
  listPublicVideos(channelId: string, limit?: number): Promise<RemoteVideo[]>;
  searchTopics(query: string, limit?: number): Promise<RemoteVideo[]>;
  upload(accessToken: string, req: UploadRequest): Promise<UploadResult>;
  setThumbnail(accessToken: string, videoId: string, image: Buffer, mimeType: string): Promise<void>;
  updateMetadata(
    accessToken: string,
    videoId: string,
    patch: { title?: string; description?: string; tags?: string[]; categoryId?: string },
  ): Promise<void>;
  getMetrics(accessToken: string, channelId: string, videoId: string, since: Date): Promise<VideoMetrics>;
}

// ── capability narrowing ─────────────────────────────────────────────────────

export function isTextCapable(p: AIProvider): p is AIProvider & TextCapable {
  return typeof (p as Partial<TextCapable>).generateText === 'function';
}
export function isStructuredCapable(p: AIProvider): p is AIProvider & StructuredCapable {
  return typeof (p as Partial<StructuredCapable>).generateStructuredOutput === 'function';
}
export function isImageCapable(p: AIProvider): p is AIProvider & ImageCapable {
  return typeof (p as Partial<ImageCapable>).generateImage === 'function';
}
export function isVideoCapable(p: AIProvider): p is AIProvider & VideoCapable {
  return typeof (p as Partial<VideoCapable>).generateVideo === 'function';
}
export function isVoiceCapable(p: AIProvider): p is AIProvider & VoiceCapable {
  return typeof (p as Partial<VoiceCapable>).generateVoice === 'function';
}
export function isMusicCapable(p: AIProvider): p is AIProvider & MusicCapable {
  return typeof (p as Partial<MusicCapable>).generateMusic === 'function';
}
export function isPublishingProvider(p: AIProvider): p is PublishingProvider {
  return typeof (p as Partial<PublishingProvider>).upload === 'function';
}
