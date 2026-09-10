import type { AppConfig } from '../config/index.js';
import type { DiscoveryRepository } from '../db/ports.js';
import type { DiscoverySourceRecord } from '../db/types.js';
import { request } from '../providers/http.js';
import type { PublishingProvider } from '../providers/types.js';
import { errorMessage } from '../shared/errors.js';
import type { Logger } from '../shared/logger.js';
import { nullLogger } from '../shared/logger.js';
import type { SourceKind } from '../shared/types.js';
import type { TrendSignal } from '../shared/schemas.js';

/**
 * Automated content discovery (spec §8).
 *
 * Every source is an adapter behind one interface, so a channel's source list is data.
 * Each adapter only ever reads documented public endpoints or a feed the user pointed us
 * at, respects the platform's rate limits, and identifies itself honestly with a
 * User-Agent — no scraping around access controls (spec §80).
 */
export interface DiscoveryContext {
  niche: string;
  language: string;
  logger: Logger;
}

export interface SourceAdapter {
  readonly kind: SourceKind;
  fetch(source: DiscoverySourceRecord, ctx: DiscoveryContext): Promise<TrendSignal[]>;
}

/** Google Trends' public daily-trends JSON, as used by the Trends site itself. */
export class GoogleTrendsSource implements SourceAdapter {
  readonly kind = 'GOOGLE_TRENDS' as const;

  async fetch(source: DiscoverySourceRecord): Promise<TrendSignal[]> {
    const geo = source.target || 'US';
    const res = await request<string>('google-trends', 'https://trends.google.com/trends/api/dailytrends', {
      method: 'GET',
      query: { hl: 'en-US', tz: '0', geo, ns: '15' },
      headers: { accept: 'application/json' },
      timeoutMs: 20_000,
    });
    // The endpoint prefixes its JSON with `)]}',` as an anti-hijacking measure.
    const body = typeof res.data === 'string' ? res.data.replace(/^\)\]\}',?\s*/, '') : '';
    const parsed = JSON.parse(body) as DailyTrends;
    const days = parsed.default?.trendingSearchesDays ?? [];
    const signals: TrendSignal[] = [];
    for (const day of days.slice(0, 2)) {
      for (const item of day.trendingSearches ?? []) {
        const traffic = parseTraffic(item.formattedTraffic);
        signals.push({
          kind: this.kind,
          topic: item.title?.query ?? '',
          url: item.title?.exploreLink ? `https://trends.google.com${item.title.exploreLink}` : undefined,
          score: Math.min(100, Math.round(Math.log10(Math.max(10, traffic)) * 22)),
          velocity: traffic,
          raw: { formattedTraffic: item.formattedTraffic },
        });
      }
    }
    return signals.filter((s) => s.topic.length > 1);
  }
}

/** Any RSS or Atom feed the user adds. */
export class RssSource implements SourceAdapter {
  readonly kind = 'RSS' as const;

  async fetch(source: DiscoverySourceRecord): Promise<TrendSignal[]> {
    const res = await request<string>('rss', source.target, {
      method: 'GET',
      headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
      timeoutMs: 20_000,
    });
    const xml = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    return parseFeed(xml).map((item, i) => ({
      kind: this.kind,
      topic: item.title,
      url: item.link,
      // Feed order is the publisher's own ranking; treat earlier items as hotter.
      score: Math.max(20, 80 - i * 3),
      raw: { publishedAt: item.date },
    }));
  }
}

/** Reddit's public listing JSON. Requires a descriptive User-Agent per their API rules. */
export class RedditSource implements SourceAdapter {
  readonly kind = 'REDDIT' as const;

  constructor(private readonly userAgent: string) {}

  async fetch(source: DiscoverySourceRecord): Promise<TrendSignal[]> {
    const subreddit = source.target.replace(/^\/?r\//, '').trim();
    const res = await request<RedditListing>('reddit', `https://www.reddit.com/r/${subreddit}/hot.json`, {
      method: 'GET',
      query: { limit: 25, raw_json: 1 },
      headers: { 'user-agent': this.userAgent, accept: 'application/json' },
      timeoutMs: 20_000,
    });
    return (res.data.data?.children ?? [])
      .map((child) => child.data)
      .filter((post): post is NonNullable<typeof post> => Boolean(post) && !post?.stickied)
      .map((post) => ({
        kind: this.kind,
        topic: post.title,
        url: post.permalink ? `https://www.reddit.com${post.permalink}` : undefined,
        score: Math.min(100, Math.round(Math.log10(Math.max(10, post.score ?? 0)) * 25)),
        velocity: post.num_comments,
        raw: { subreddit, upvotes: post.score, comments: post.num_comments },
      }));
  }
}

/** Wikipedia's most-viewed articles — a good proxy for durable, evergreen interest. */
export class WikipediaSource implements SourceAdapter {
  readonly kind = 'WIKIPEDIA' as const;

  async fetch(source: DiscoverySourceRecord): Promise<TrendSignal[]> {
    const lang = source.target || 'en';
    const yesterday = new Date(Date.now() - 86_400_000);
    const y = yesterday.getUTCFullYear();
    const m = String(yesterday.getUTCMonth() + 1).padStart(2, '0');
    const d = String(yesterday.getUTCDate()).padStart(2, '0');
    const res = await request<PageviewsResponse>(
      'wikipedia',
      `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${lang}.wikipedia/all-access/${y}/${m}/${d}`,
      { method: 'GET', headers: { accept: 'application/json' }, timeoutMs: 20_000 },
    );
    const articles = res.data.items?.[0]?.articles ?? [];
    return articles
      .filter((a) => !/^(Main_Page|Special:|Wikipedia:|Portal:)/.test(a.article))
      .slice(0, 30)
      .map((a) => ({
        kind: this.kind,
        topic: a.article.replace(/_/g, ' '),
        url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(a.article)}`,
        score: Math.min(100, Math.round(Math.log10(Math.max(100, a.views)) * 18)),
        velocity: a.views,
      }));
  }
}

/** NewsAPI.org headlines, when the user supplies a key. */
export class NewsApiSource implements SourceAdapter {
  readonly kind = 'NEWS_API' as const;

  constructor(private readonly apiKey: string) {}

  async fetch(source: DiscoverySourceRecord, ctx: DiscoveryContext): Promise<TrendSignal[]> {
    if (!this.apiKey) return [];
    const res = await request<NewsApiResponse>('newsapi', 'https://newsapi.org/v2/everything', {
      method: 'GET',
      query: {
        q: source.target || ctx.niche,
        language: ctx.language.slice(0, 2),
        sortBy: 'popularity',
        pageSize: 25,
      },
      headers: { 'x-api-key': this.apiKey },
      timeoutMs: 20_000,
    });
    return (res.data.articles ?? []).map((article, i) => ({
      kind: this.kind,
      topic: article.title ?? '',
      url: article.url,
      score: Math.max(25, 85 - i * 2),
      raw: { source: article.source?.name, publishedAt: article.publishedAt },
    }));
  }
}

/** YouTube search — what is already getting views on this topic. */
export class YouTubeSearchSource implements SourceAdapter {
  readonly kind = 'YOUTUBE' as const;

  constructor(private readonly provider: PublishingProvider) {}

  async fetch(source: DiscoverySourceRecord, ctx: DiscoveryContext): Promise<TrendSignal[]> {
    const videos = await this.provider.searchTopics(source.target || ctx.niche, 25);
    const maxViews = Math.max(1, ...videos.map((v) => v.views ?? 0));
    return videos.map((video) => ({
      kind: this.kind,
      topic: video.title,
      url: `https://www.youtube.com/watch?v=${video.id}`,
      score: Math.round(((video.views ?? 0) / maxViews) * 100),
      velocity: video.views,
      raw: { publishedAt: video.publishedAt, durationSec: video.durationSec },
    }));
  }
}

/** A topic the user typed in themselves — always at full weight. */
export class ManualSource implements SourceAdapter {
  readonly kind = 'MANUAL' as const;
  async fetch(source: DiscoverySourceRecord): Promise<TrendSignal[]> {
    return source.target
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((topic) => ({ kind: this.kind, topic, score: 90 }));
  }
}

/** Offline stand-in so discovery is exercised in tests without hitting any network. */
export class MockDiscoverySource implements SourceAdapter {
  readonly kind: SourceKind;
  constructor(kind: SourceKind = 'MANUAL') {
    this.kind = kind;
  }
  async fetch(source: DiscoverySourceRecord, ctx: DiscoveryContext): Promise<TrendSignal[]> {
    const seeds = [
      `why ${ctx.niche} changed after 1970`,
      `the ${ctx.niche} mistake everyone repeats`,
      `${ctx.niche}: the part nobody explains`,
      `what ${ctx.niche} looked like before the rules`,
      `the quiet history of ${ctx.niche}`,
    ];
    return seeds.map((topic, i) => ({
      kind: this.kind,
      topic,
      score: 90 - i * 7,
      velocity: 1000 - i * 120,
      url: `https://example.org/${source.id}/${i}`,
    }));
  }
}

export class DiscoveryService {
  private readonly adapters = new Map<SourceKind, SourceAdapter>();

  constructor(
    private readonly repo: DiscoveryRepository,
    private readonly logger: Logger = nullLogger,
  ) {}

  register(adapter: SourceAdapter): this {
    this.adapters.set(adapter.kind, adapter);
    return this;
  }

  /**
   * Crawls every enabled source for a channel. One failing source never fails the crawl —
   * a dead RSS feed must not stop the autopilot.
   */
  async crawl(channelId: string, ctx: Omit<DiscoveryContext, 'logger'>): Promise<TrendSignal[]> {
    const sources = (await this.repo.listSources(channelId)).filter((s) => s.enabled);
    const collected: TrendSignal[] = [];

    for (const source of sources) {
      const adapter = this.adapters.get(source.kind);
      if (!adapter) {
        this.logger.warn('no adapter for discovery source', { channelId, kind: source.kind });
        continue;
      }
      try {
        const signals = await adapter.fetch(source, { ...ctx, logger: this.logger });
        const cleaned = signals
          .filter((s) => s.topic.trim().length > 2)
          .slice(0, 50)
          .map((s) => ({ ...s, topic: s.topic.trim().slice(0, 300) }));
        collected.push(...cleaned);
        await this.repo.recordSignals(
          cleaned.map((s) => ({
            sourceId: source.id,
            channelId,
            kind: s.kind,
            topic: s.topic,
            url: s.url ?? null,
            score: s.score,
            velocity: s.velocity ?? null,
            raw: s.raw ?? null,
            observedAt: new Date(),
          })),
        );
        await this.repo.updateSource(source.id, { lastRunAt: new Date() });
        this.logger.info('discovery source crawled', {
          channelId,
          kind: source.kind,
          label: source.label,
          signals: cleaned.length,
        });
      } catch (err) {
        this.logger.warn('discovery source failed', {
          channelId,
          kind: source.kind,
          label: source.label,
          error: errorMessage(err),
        });
      }
    }

    return dedupe(collected);
  }
}

/** The starter source list a new channel gets. */
export function defaultSourcesFor(channelId: string, niche: string, language: string) {
  return [
    { channelId, kind: 'YOUTUBE' as const, label: `YouTube: ${niche}`, target: niche, enabled: true },
    { channelId, kind: 'GOOGLE_TRENDS' as const, label: 'Google Trends (US)', target: 'US', enabled: true },
    {
      channelId,
      kind: 'WIKIPEDIA' as const,
      label: 'Wikipedia most-read',
      target: language.slice(0, 2),
      enabled: true,
    },
  ];
}

export function buildDiscoveryService(
  repo: DiscoveryRepository,
  config: AppConfig,
  youtube: PublishingProvider | undefined,
  logger: Logger = nullLogger,
): DiscoveryService {
  const service = new DiscoveryService(repo, logger);
  if (config.offline) {
    for (const kind of ['YOUTUBE', 'GOOGLE_TRENDS', 'WIKIPEDIA', 'RSS', 'REDDIT', 'NEWS_API', 'MANUAL'] as const) {
      service.register(new MockDiscoverySource(kind));
    }
    return service;
  }

  service.register(new GoogleTrendsSource());
  service.register(new RssSource());
  service.register(new WikipediaSource());
  service.register(new ManualSource());
  service.register(new RedditSource(config.providers.reddit.userAgent));
  if (config.providers.newsApi.key.present) {
    service.register(new NewsApiSource(config.providers.newsApi.key.reveal()));
  }
  if (youtube) service.register(new YouTubeSearchSource(youtube));
  return service;
}

/** Merges duplicate topics, keeping the strongest signal for each. */
export function dedupe(signals: TrendSignal[]): TrendSignal[] {
  const best = new Map<string, TrendSignal>();
  for (const signal of signals) {
    const key = signal.topic.toLowerCase().replace(/\s+/g, ' ').trim();
    const current = best.get(key);
    if (!current || signal.score > current.score) best.set(key, signal);
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

/** Minimal RSS/Atom reader — enough for titles, links and dates, with no XML dependency. */
export function parseFeed(xml: string): Array<{ title: string; link?: string; date?: string }> {
  const items: Array<{ title: string; link?: string; date?: string }> = [];
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/g) ?? [];
  for (const block of blocks.slice(0, 40)) {
    const title = decodeXml(pick(block, 'title'));
    if (!title) continue;
    const link =
      pick(block, 'link') || /<link[^>]*href=["']([^"']+)["']/.exec(block)?.[1] || undefined;
    const date = pick(block, 'pubDate') || pick(block, 'updated') || pick(block, 'published') || undefined;
    items.push({ title, link: link ? decodeXml(link) : undefined, date });
  }
  return items;
}

function pick(block: string, tag: string): string {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(block);
  if (!match?.[1]) return '';
  return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/** "200K+" → 200000 */
function parseTraffic(formatted?: string): number {
  if (!formatted) return 0;
  const match = /([\d.]+)\s*([KMB])?/i.exec(formatted.replace(/[,+]/g, ''));
  if (!match) return 0;
  const value = Number(match[1] ?? 0);
  const unit = (match[2] ?? '').toUpperCase();
  return value * (unit === 'B' ? 1e9 : unit === 'M' ? 1e6 : unit === 'K' ? 1e3 : 1);
}

interface DailyTrends {
  default?: {
    trendingSearchesDays?: Array<{
      trendingSearches?: Array<{ title?: { query?: string; exploreLink?: string }; formattedTraffic?: string }>;
    }>;
  };
}

interface RedditListing {
  data?: {
    children?: Array<{
      data?: { title: string; permalink?: string; score?: number; num_comments?: number; stickied?: boolean };
    }>;
  };
}

interface PageviewsResponse {
  items?: Array<{ articles?: Array<{ article: string; views: number }> }>;
}

interface NewsApiResponse {
  articles?: Array<{ title?: string; url?: string; publishedAt?: string; source?: { name?: string } }>;
}
