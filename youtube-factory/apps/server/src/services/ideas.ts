import type { Agents } from '../agents/index.js';
import type { Repositories } from '../db/ports.js';
import type { ChannelRecord, ChannelSettingsRecord, ContentIdeaRecord } from '../db/types.js';
import type { PublishingProvider } from '../providers/types.js';
import type { Clock } from '../shared/clock.js';
import { errorMessage } from '../shared/errors.js';
import type { Logger } from '../shared/logger.js';
import { nullLogger } from '../shared/logger.js';
import { DEFAULT_IDEA_WEIGHTS, scoreIdea, type IdeaWeights } from '../shared/scoring.js';
import type { TrendSignal } from '../shared/schemas.js';
import type { IdeaStatus } from '../shared/types.js';
import type { DiscoveryService } from './discovery.js';
import type { LearningEngine } from './learning.js';

export interface GenerateIdeasOptions {
  count?: number;
  /** Skip the crawl and use the signals already recorded. */
  useStoredSignals?: boolean;
  autoApprove?: boolean;
}

export interface GeneratedIdeas {
  ideas: ContentIdeaRecord[];
  signalsUsed: number;
  competitorTopics: string[];
}

/**
 * The idea engine (spec §10, §11). Pulls trend signals, competitor patterns and accumulated
 * learnings together, asks the idea agent for candidates, then scores them here — in code —
 * so the ranking is auditable and the weights are the user's to change.
 */
export class IdeaService {
  constructor(
    private readonly deps: {
      repos: Repositories;
      agents: Agents;
      discovery: DiscoveryService;
      learning: LearningEngine;
      clock: Clock;
      logger?: Logger;
      youtube?: PublishingProvider;
    },
  ) {}

  private get logger(): Logger {
    return this.deps.logger ?? nullLogger;
  }

  async generate(
    channel: ChannelRecord,
    settings: ChannelSettingsRecord,
    opts: GenerateIdeasOptions = {},
  ): Promise<GeneratedIdeas> {
    const count = opts.count ?? 5;

    let signals: TrendSignal[] = [];
    if (opts.useStoredSignals) {
      const since = new Date(this.deps.clock.now().getTime() - 7 * 86_400_000);
      const stored = await this.deps.repos.discovery.recentSignals(channel.id, since, 60);
      signals = stored.map((s) => ({
        kind: s.kind,
        topic: s.topic,
        url: s.url ?? undefined,
        score: s.score,
        velocity: s.velocity ?? undefined,
      }));
    } else {
      signals = await this.deps.discovery.crawl(channel.id, {
        niche: settings.niche,
        language: settings.language,
      });
    }

    const competitorTopics = await this.competitorTopics(channel, settings);
    const learnings = await this.deps.learning.summarize(channel.id, 10);
    const recent = await this.deps.repos.videos.listByChannel(channel.id, { limit: 30 });
    const existingIdeas = await this.deps.repos.ideas.listByChannel(channel.id, { limit: 100 });

    const result = await this.deps.agents.idea
      .withWeights((settings.ideaWeights as Partial<IdeaWeights>) ?? DEFAULT_IDEA_WEIGHTS)
      .run(
        {
          niche: settings.niche,
          language: settings.language,
          targetAudience: settings.targetAudience,
          contentStyle: settings.contentStyle,
          count,
          trends: signals.slice(0, 30),
          competitorTopics,
          recentTitles: recent.items.map((v) => v.title),
          learnings,
          // Never re-propose something already produced or explicitly rejected.
          avoidTopics: existingIdeas
            .filter((i) => i.status === 'REJECTED' || i.status === 'PRODUCED' || i.status === 'IN_PRODUCTION')
            .map((i) => i.topic),
        },
        { channelId: channel.id },
      );

    const weights = { ...DEFAULT_IDEA_WEIGHTS, ...((settings.ideaWeights as Partial<IdeaWeights>) ?? {}) };
    const records = result.output.ideas.map((idea) => {
      const breakdown = scoreIdea(idea, weights);
      return {
        channelId: channel.id,
        title: idea.title,
        topic: idea.topic,
        angle: idea.angle,
        hook: idea.hook,
        targetAudience: idea.targetAudience,
        rationale: idea.rationale ?? null,
        status: opts.autoApprove || settings.automationMode === 'FULL_AUTO'
          ? ('APPROVED' as IdeaStatus)
          : ('PROPOSED' as IdeaStatus),
        estimatedDemand: idea.estimatedDemand,
        competition: idea.competition,
        novelty: idea.novelty,
        evergreenScore: idea.evergreenScore,
        trendScore: idea.trendScore,
        productionCostUsd: idea.productionCostUsd,
        estimatedCtr: idea.estimatedCtr,
        estimatedRetention: idea.estimatedRetention,
        overallScore: breakdown.overall,
        scoreBreakdown: breakdown as unknown as Record<string, unknown>,
        sourceSignals: {
          trends: signals.slice(0, 10).map((s) => s.topic),
          competitorTopics: competitorTopics.slice(0, 10),
        },
      };
    });

    const saved = await this.deps.repos.ideas.createMany(records);
    this.logger.info('ideas generated', {
      channelId: channel.id,
      count: saved.length,
      signals: signals.length,
      topScore: Math.max(0, ...saved.map((i) => i.overallScore)),
    });

    return { ideas: saved, signalsUsed: signals.length, competitorTopics };
  }

  /** What is working for the channels the user tracks (spec §9). */
  async competitorTopics(channel: ChannelRecord, settings: ChannelSettingsRecord): Promise<string[]> {
    const competitors = await this.deps.repos.competitors.listByChannel(channel.id);
    if (competitors.length === 0) return [];

    const snapshots: Array<{
      name: string;
      subscriberCount?: number;
      recentVideos: Array<{ title: string; views?: number; durationSec?: number; publishedAt?: string }>;
    }> = [];

    for (const competitor of competitors) {
      // Prefer a fresh pull; fall back to the last stored snapshot when the API is
      // unavailable or the key is missing, so analysis still runs.
      let videos = (competitor.snapshot?.recentVideos as typeof snapshots[number]['recentVideos'] | undefined) ?? [];
      if (this.deps.youtube) {
        try {
          const fetched = await this.deps.youtube.listPublicVideos(competitor.youtubeChannelId, 15);
          videos = fetched.map((v) => ({
            title: v.title,
            views: v.views,
            durationSec: v.durationSec,
            publishedAt: v.publishedAt,
          }));
          await this.deps.repos.competitors.update(competitor.id, {
            lastAnalyzedAt: this.deps.clock.now(),
            snapshot: { recentVideos: videos },
            avgViews: average(videos.map((v) => v.views ?? 0)),
            avgDurationSec: Math.round(average(videos.map((v) => v.durationSec ?? 0))),
            uploadFrequency: uploadsPerWeek(videos.map((v) => v.publishedAt)),
          });
        } catch (err) {
          this.logger.warn('competitor refresh failed, using the stored snapshot', {
            channelId: channel.id,
            competitor: competitor.name,
            error: errorMessage(err),
          });
        }
      }
      if (videos.length) {
        snapshots.push({
          name: competitor.name,
          subscriberCount: competitor.subscriberCount ?? undefined,
          recentVideos: videos,
        });
      }
    }

    if (snapshots.length === 0) return [];

    try {
      const analysis = await this.deps.agents.competitor.run(
        { niche: settings.niche, channels: snapshots },
        { channelId: channel.id },
      );
      return [
        ...analysis.output.workingTopics.map((t) => `${t.topic} (strength ${t.strength})`),
        ...analysis.output.contentGaps.map((g) => `GAP: ${g}`),
      ];
    } catch (err) {
      this.logger.warn('competitor analysis failed', { channelId: channel.id, error: errorMessage(err) });
      // Even without the agent, the raw titles are useful signal for the idea agent.
      return snapshots.flatMap((s) => s.recentVideos.slice(0, 5).map((v) => v.title));
    }
  }

  /** Highest-scoring idea eligible for production under this channel's settings. */
  async pickBest(channelId: string, settings: ChannelSettingsRecord): Promise<ContentIdeaRecord | null> {
    const allowProposed = settings.automationMode === 'FULL_AUTO';
    return this.deps.repos.ideas.bestCandidate(channelId, settings.minIdeaScore, allowProposed);
  }
}

function average(values: number[]): number {
  const usable = values.filter((v) => v > 0);
  return usable.length ? usable.reduce((a, b) => a + b, 0) / usable.length : 0;
}

function uploadsPerWeek(dates: Array<string | undefined>): number {
  const times = dates
    .filter((d): d is string => Boolean(d))
    .map((d) => new Date(d).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a);
  if (times.length < 2) return 0;
  const spanDays = (times[0]! - times[times.length - 1]!) / 86_400_000;
  if (spanDays <= 0) return 0;
  return Math.round(((times.length - 1) / spanDays) * 7 * 10) / 10;
}
