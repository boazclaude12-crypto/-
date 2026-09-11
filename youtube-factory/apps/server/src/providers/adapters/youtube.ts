import { readFile, stat } from 'node:fs/promises';
import type { AppConfig } from '../../config/index.js';
import { ProviderError, ProviderNotConfiguredError } from '../../shared/errors.js';
import type { Capability } from '../../shared/types.js';
import { request } from '../http.js';
import { estimate } from '../rates.js';
import type {
  EstimateInput,
  OAuthTokens,
  ProviderHealth,
  PublishingProvider,
  RemoteChannel,
  RemoteVideo,
  UploadRequest,
  UploadResult,
  VideoMetrics,
} from '../types.js';

/**
 * Google's endpoints. They are grouped so a test (or a corporate egress proxy) can point the
 * adapter somewhere else without touching the request-building logic — which is the part
 * that has to be exactly right.
 */
export interface YouTubeEndpoints {
  oauthAuth: string;
  oauthToken: string;
  oauthRevoke: string;
  api: string;
  upload: string;
  analytics: string;
}

export const GOOGLE_ENDPOINTS: YouTubeEndpoints = {
  oauthAuth: 'https://accounts.google.com/o/oauth2/v2/auth',
  oauthToken: 'https://oauth2.googleapis.com/token',
  oauthRevoke: 'https://oauth2.googleapis.com/revoke',
  api: 'https://www.googleapis.com/youtube/v3',
  upload: 'https://www.googleapis.com/upload/youtube/v3',
  analytics: 'https://youtubeanalytics.googleapis.com/v2',
};

/** Least-privilege scope set: read the channel, upload, and read the owner's analytics. */
export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
];

/**
 * YouTube Data API v3 + YouTube Analytics API v2, over OAuth 2.0 (spec §5, §31, §34).
 *
 * Everything here stays inside the platform's documented surface: quota is respected by
 * backing off on 403 `quotaExceeded`, uploads use the documented resumable protocol, and
 * nothing attempts to work around a platform limit (spec §80).
 */
export class YouTubeProvider implements PublishingProvider {
  readonly key = 'youtube';
  readonly name = 'YouTube';
  readonly capabilities: readonly Capability[] = ['publish'];

  private readonly endpoints: YouTubeEndpoints;

  constructor(
    private readonly config: AppConfig,
    endpoints: Partial<YouTubeEndpoints> = {},
  ) {
    this.endpoints = { ...GOOGLE_ENDPOINTS, ...endpoints };
  }

  private get creds() {
    return this.config.providers.youtube;
  }

  isConfigured(): boolean {
    return this.creds.clientId.present && this.creds.clientSecret.present;
  }

  missingConfig(): string[] {
    const missing: string[] = [];
    if (!this.creds.clientId.present) missing.push('YOUTUBE_CLIENT_ID');
    if (!this.creds.clientSecret.present) missing.push('YOUTUBE_CLIENT_SECRET');
    return missing;
  }

  estimateCost(input: EstimateInput) {
    return estimate(this.key, input);
  }

  async health(): Promise<ProviderHealth> {
    if (!this.isConfigured()) return { ok: false, detail: 'OAuth client not configured' };
    return { ok: true, detail: 'OAuth client configured; per-channel authorisation required' };
  }

  // ── OAuth ────────────────────────────────────────────────────────────────

  authorizeUrl(state: string, extraScopes: string[] = []): string {
    if (!this.isConfigured()) throw new ProviderNotConfiguredError(this.key, this.missingConfig());
    const url = new URL(this.endpoints.oauthAuth);
    url.searchParams.set('client_id', this.creds.clientId.reveal());
    url.searchParams.set('redirect_uri', this.creds.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', [...YOUTUBE_SCOPES, ...extraScopes].join(' '));
    // offline + consent is what actually yields a refresh token on repeat authorisations.
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('state', state);
    return url.toString();
  }

  async exchangeCode(code: string): Promise<OAuthTokens> {
    const res = await request<TokenResponse>(this.key, this.endpoints.oauthToken, {
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      rawBody: new URLSearchParams({
        code,
        client_id: this.creds.clientId.reveal(),
        client_secret: this.creds.clientSecret.reveal(),
        redirect_uri: this.creds.redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
      timeoutMs: 30_000,
    });
    return toTokens(res.data);
  }

  async refresh(refreshToken: string): Promise<OAuthTokens> {
    const res = await request<TokenResponse>(this.key, this.endpoints.oauthToken, {
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      rawBody: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: this.creds.clientId.reveal(),
        client_secret: this.creds.clientSecret.reveal(),
        grant_type: 'refresh_token',
      }).toString(),
      timeoutMs: 30_000,
    });
    // A refresh response omits refresh_token; the caller keeps the one it already holds.
    return { ...toTokens(res.data), refreshToken };
  }

  async revoke(token: string): Promise<void> {
    await request(this.key, this.endpoints.oauthRevoke, {
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      rawBody: new URLSearchParams({ token }).toString(),
      timeoutMs: 15_000,
    });
  }

  // ── channel + video reads ────────────────────────────────────────────────

  async getChannel(accessToken: string): Promise<RemoteChannel> {
    const res = await request<ChannelListResponse>(this.key, `${this.endpoints.api}/channels`, {
      headers: { authorization: `Bearer ${accessToken}` },
      method: 'GET',
      query: { part: 'snippet,statistics,contentDetails', mine: 'true' },
      timeoutMs: 30_000,
    });
    const item = res.data.items?.[0];
    if (!item) throw new ProviderError(this.key, 'The authorised account has no YouTube channel', { retryable: false });
    return mapChannel(item);
  }

  async listChannelVideos(accessToken: string, channelId: string, limit = 25): Promise<RemoteVideo[]> {
    const res = await request<SearchListResponse>(this.key, `${this.endpoints.api}/search`, {
      headers: { authorization: `Bearer ${accessToken}` },
      method: 'GET',
      query: { part: 'snippet', channelId, order: 'date', type: 'video', maxResults: Math.min(limit, 50) },
      timeoutMs: 30_000,
    });
    const ids = (res.data.items ?? []).map((i) => i.id?.videoId).filter(Boolean) as string[];
    if (ids.length === 0) return [];
    return this.hydrateVideos(ids, { authorization: `Bearer ${accessToken}` });
  }

  async lookupPublicChannel(channelId: string): Promise<RemoteChannel | null> {
    const query = channelId.startsWith('UC')
      ? { part: 'snippet,statistics,contentDetails', id: channelId }
      : { part: 'snippet,statistics,contentDetails', forHandle: channelId };
    const res = await request<ChannelListResponse>(this.key, `${this.endpoints.api}/channels`, {
      method: 'GET',
      query: { ...query, key: this.requireApiKey() },
      timeoutMs: 30_000,
    });
    const item = res.data.items?.[0];
    return item ? mapChannel(item) : null;
  }

  async listPublicVideos(channelId: string, limit = 25): Promise<RemoteVideo[]> {
    const res = await request<SearchListResponse>(this.key, `${this.endpoints.api}/search`, {
      method: 'GET',
      query: {
        part: 'snippet',
        channelId,
        order: 'date',
        type: 'video',
        maxResults: Math.min(limit, 50),
        key: this.requireApiKey(),
      },
      timeoutMs: 30_000,
    });
    const ids = (res.data.items ?? []).map((i) => i.id?.videoId).filter(Boolean) as string[];
    if (ids.length === 0) return [];
    return this.hydrateVideos(ids, {}, this.requireApiKey());
  }

  async searchTopics(query: string, limit = 25): Promise<RemoteVideo[]> {
    const res = await request<SearchListResponse>(this.key, `${this.endpoints.api}/search`, {
      method: 'GET',
      query: {
        part: 'snippet',
        q: query,
        order: 'viewCount',
        type: 'video',
        maxResults: Math.min(limit, 50),
        publishedAfter: new Date(Date.now() - 90 * 86_400_000).toISOString(),
        key: this.requireApiKey(),
      },
      timeoutMs: 30_000,
    });
    const ids = (res.data.items ?? []).map((i) => i.id?.videoId).filter(Boolean) as string[];
    if (ids.length === 0) return [];
    return this.hydrateVideos(ids, {}, this.requireApiKey());
  }

  private async hydrateVideos(
    ids: string[],
    headers: Record<string, string>,
    apiKey?: string,
  ): Promise<RemoteVideo[]> {
    const res = await request<VideoListResponse>(this.key, `${this.endpoints.api}/videos`, {
      headers,
      method: 'GET',
      query: {
        part: 'snippet,statistics,contentDetails',
        id: ids.join(','),
        ...(apiKey ? { key: apiKey } : {}),
      },
      timeoutMs: 30_000,
    });
    return (res.data.items ?? []).map((item) => ({
      id: item.id,
      title: item.snippet?.title ?? '',
      publishedAt: item.snippet?.publishedAt,
      durationSec: parseIsoDuration(item.contentDetails?.duration),
      views: numberOf(item.statistics?.viewCount),
      likes: numberOf(item.statistics?.likeCount),
      comments: numberOf(item.statistics?.commentCount),
      thumbnailUrl: item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.default?.url,
    }));
  }

  private requireApiKey(): string {
    if (!this.creds.apiKey.present) {
      throw new ProviderNotConfiguredError(this.key, ['YOUTUBE_API_KEY (needed for public/competitor lookups)']);
    }
    return this.creds.apiKey.reveal();
  }

  // ── upload ───────────────────────────────────────────────────────────────

  /**
   * Resumable upload, per the documented two-step protocol: POST the metadata to obtain a
   * session URI, then PUT the bytes to that URI. Large renders are sent in chunks so a
   * dropped connection resumes instead of restarting.
   */
  async upload(accessToken: string, req: UploadRequest): Promise<UploadResult> {
    const size = (await stat(req.filePath)).size;
    const snippet: Record<string, unknown> = {
      title: req.title.slice(0, 100),
      description: req.description.slice(0, 5000),
      tags: req.tags.slice(0, 60),
      categoryId: req.categoryId,
      ...(req.language ? { defaultLanguage: req.language, defaultAudioLanguage: req.language } : {}),
    };
    const status: Record<string, unknown> = {
      privacyStatus: req.privacyStatus,
      selfDeclaredMadeForKids: req.madeForKids ?? false,
      ...(req.publishAt ? { publishAt: req.publishAt.toISOString() } : {}),
    };

    const init = await request<unknown>(this.key, `${this.endpoints.upload}/videos`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json; charset=UTF-8',
        'x-upload-content-length': String(size),
        'x-upload-content-type': 'video/mp4',
      },
      query: { uploadType: 'resumable', part: 'snippet,status' },
      body: { snippet, status },
      timeoutMs: 60_000,
    });

    const sessionUri = init.headers.get('location');
    if (!sessionUri) {
      throw new ProviderError(this.key, 'YouTube did not return a resumable upload session URI', {
        retryable: true,
      });
    }

    const result = await this.uploadBytes(sessionUri, req.filePath, size, req.onProgress);
    return {
      videoId: result.id,
      uploadStatus: result.status?.uploadStatus ?? 'uploaded',
      privacyStatus: result.status?.privacyStatus ?? req.privacyStatus,
    };
  }

  private async uploadBytes(
    sessionUri: string,
    filePath: string,
    size: number,
    onProgress?: (uploaded: number, total: number) => void,
  ): Promise<UploadedVideo> {
    // 8 MiB chunks: a multiple of 256 KiB as the protocol requires, small enough that a
    // failure costs little and large enough to keep the round-trip count sane.
    const CHUNK = 8 * 1024 * 1024;
    const body = await readFile(filePath);
    let offset = 0;

    for (;;) {
      const end = Math.min(offset + CHUNK, size);
      const chunk = body.subarray(offset, end);
      const res = await fetch(sessionUri, {
        method: 'PUT',
        headers: {
          'content-length': String(chunk.length),
          'content-range': `bytes ${offset}-${end - 1}/${size}`,
        },
        body: chunk as never,
      });

      if (res.status === 308) {
        const range = res.headers.get('range');
        offset = range ? Number(range.split('-')[1]) + 1 : end;
        onProgress?.(offset, size);
        continue;
      }
      if (res.ok) {
        onProgress?.(size, size);
        return (await res.json()) as UploadedVideo;
      }
      const text = await res.text().catch(() => '');
      throw new ProviderError(this.key, `Upload failed with HTTP ${res.status}: ${text.slice(0, 300)}`, {
        status: res.status,
      });
    }
  }

  async setThumbnail(accessToken: string, videoId: string, image: Buffer, mimeType: string): Promise<void> {
    await request(this.key, `${this.endpoints.upload}/thumbnails/set`, {
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': mimeType },
      query: { videoId, uploadType: 'media' },
      rawBody: image,
      method: 'POST',
      timeoutMs: 120_000,
    });
  }

  async updateMetadata(
    accessToken: string,
    videoId: string,
    patch: { title?: string; description?: string; tags?: string[]; categoryId?: string },
  ): Promise<void> {
    // videos.update replaces the whole snippet, so the current values are read first.
    const current = await request<VideoListResponse>(this.key, `${this.endpoints.api}/videos`, {
      headers: { authorization: `Bearer ${accessToken}` },
      method: 'GET',
      query: { part: 'snippet', id: videoId },
      timeoutMs: 30_000,
    });
    const snippet = current.data.items?.[0]?.snippet;
    if (!snippet) throw new ProviderError(this.key, `Video ${videoId} not found`, { retryable: false });

    await request(this.key, `${this.endpoints.api}/videos`, {
      headers: { authorization: `Bearer ${accessToken}` },
      method: 'PUT',
      query: { part: 'snippet' },
      body: {
        id: videoId,
        snippet: {
          title: patch.title ?? snippet.title,
          description: patch.description ?? snippet.description,
          tags: patch.tags ?? snippet.tags,
          categoryId: patch.categoryId ?? snippet.categoryId,
        },
      },
      timeoutMs: 30_000,
    });
  }

  // ── analytics ────────────────────────────────────────────────────────────

  async getMetrics(
    accessToken: string,
    channelId: string,
    videoId: string,
    since: Date,
  ): Promise<VideoMetrics> {
    const metrics = [
      'views',
      'estimatedMinutesWatched',
      'averageViewDuration',
      'averageViewPercentage',
      'likes',
      'comments',
      'shares',
      'subscribersGained',
    ];

    const report = await request<AnalyticsReport>(this.key, `${this.endpoints.analytics}/reports`, {
      headers: { authorization: `Bearer ${accessToken}` },
      method: 'GET',
      query: {
        ids: `channel==${channelId}`,
        startDate: isoDate(since),
        endDate: isoDate(new Date()),
        metrics: metrics.join(','),
        filters: `video==${videoId}`,
      },
      timeoutMs: 30_000,
    });

    const row = report.data.rows?.[0] ?? [];
    const headers = report.data.columnHeaders?.map((h) => h.name) ?? metrics;
    const pick = (name: string): number => {
      const index = headers.indexOf(name);
      return index >= 0 ? Number(row[index] ?? 0) : 0;
    };

    // Impressions and CTR live in a separate report dimension and are unavailable to some
    // channels; a failure there must not lose the metrics we did get.
    let impressions = 0;
    let ctr = 0;
    try {
      const ctrReport = await request<AnalyticsReport>(this.key, `${this.endpoints.analytics}/reports`, {
        headers: { authorization: `Bearer ${accessToken}` },
        method: 'GET',
        query: {
          ids: `channel==${channelId}`,
          startDate: isoDate(since),
          endDate: isoDate(new Date()),
          metrics: 'impressions,impressionsClickThroughRate',
          filters: `video==${videoId}`,
        },
        timeoutMs: 30_000,
      });
      const ctrRow = ctrReport.data.rows?.[0] ?? [];
      impressions = Number(ctrRow[0] ?? 0);
      ctr = Number(ctrRow[1] ?? 0);
    } catch {
      /* channel not eligible for impression reporting — leave both at zero */
    }

    return {
      views: pick('views'),
      watchTimeMinutes: pick('estimatedMinutesWatched'),
      averageViewDuration: pick('averageViewDuration'),
      averageViewPercentage: pick('averageViewPercentage'),
      impressions,
      ctr,
      likes: pick('likes'),
      comments: pick('comments'),
      shares: pick('shares'),
      subscribersGained: pick('subscribersGained'),
      raw: { columnHeaders: headers, row },
    };
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function toTokens(body: TokenResponse): OAuthTokens {
  if (!body.access_token) {
    throw new ProviderError('youtube', 'Token endpoint returned no access token', { retryable: false });
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(Date.now() + (body.expires_in ?? 3600) * 1000),
    scope: body.scope ?? YOUTUBE_SCOPES.join(' '),
    tokenType: body.token_type ?? 'Bearer',
  };
}

function mapChannel(item: ChannelItem): RemoteChannel {
  return {
    id: item.id,
    title: item.snippet?.title ?? '',
    description: item.snippet?.description,
    thumbnailUrl: item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.default?.url,
    subscriberCount: numberOf(item.statistics?.subscriberCount),
    videoCount: numberOf(item.statistics?.videoCount),
    viewCount: numberOf(item.statistics?.viewCount),
    uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads,
  };
}

function numberOf(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** ISO 8601 duration (`PT1H2M3S`) → seconds. */
export function parseIsoDuration(value?: string): number | undefined {
  if (!value) return undefined;
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value);
  if (!m) return undefined;
  const [, d, h, min, s] = m;
  return Number(d ?? 0) * 86_400 + Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Number(s ?? 0);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

interface Thumbnails {
  default?: { url: string };
  high?: { url: string };
}

interface ChannelItem {
  id: string;
  snippet?: { title?: string; description?: string; thumbnails?: Thumbnails };
  statistics?: { subscriberCount?: string; videoCount?: string; viewCount?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
}

interface ChannelListResponse {
  items?: ChannelItem[];
}

interface SearchListResponse {
  items?: Array<{ id?: { videoId?: string } }>;
}

interface VideoItem {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    publishedAt?: string;
    tags?: string[];
    categoryId?: string;
    thumbnails?: Thumbnails;
  };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration?: string };
}

interface VideoListResponse {
  items?: VideoItem[];
}

interface UploadedVideo {
  id: string;
  status?: { uploadStatus?: string; privacyStatus?: string };
}

interface AnalyticsReport {
  columnHeaders?: Array<{ name: string }>;
  rows?: Array<Array<string | number>>;
}
