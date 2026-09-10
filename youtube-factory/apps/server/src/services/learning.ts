import type { Agents } from '../agents/index.js';
import type {
  AnalyticsRepository,
  LearningRepository,
  ScriptRepository,
  SeoRepository,
  ThumbnailRepository,
  VideoRepository,
} from '../db/ports.js';
import type { AnalyticsSnapshotRecord, VideoRecord } from '../db/types.js';
import type { Clock } from '../shared/clock.js';
import type { Logger } from '../shared/logger.js';
import { nullLogger } from '../shared/logger.js';
import { round } from '../shared/scoring.js';

export interface ChannelBaseline {
  videos: number;
  avgViews: number;
  avgCtr: number;
  avgViewPercentage: number;
  avgDurationSec: number;
  bestVideoId?: string;
  worstVideoId?: string;
}

/**
 * Learning engine (spec §35, §78).
 *
 * After a video has been live long enough to mean something, the system compares what it
 * predicted against what happened and stores durable, weighted observations. Those feed the
 * idea agent and the weekly strategist, which is the loop that makes the channel improve
 * rather than merely repeat.
 *
 * Production prompts are never rewritten automatically — learnings are data the agents
 * read, and any prompt change is an explicit, versioned action (spec §78).
 */
export class LearningEngine {
  constructor(
    private readonly deps: {
      videos: VideoRepository;
      analytics: AnalyticsRepository;
      learnings: LearningRepository;
      scripts: ScriptRepository;
      thumbnails: ThumbnailRepository;
      seo: SeoRepository;
      agents: Agents;
      clock: Clock;
      logger?: Logger;
    },
  ) {}

  private get logger(): Logger {
    return this.deps.logger ?? nullLogger;
  }

  async baseline(channelId: string, sinceDays = 90): Promise<ChannelBaseline> {
    const since = new Date(this.deps.clock.now().getTime() - sinceDays * 86_400_000);
    const videos = await this.deps.videos.listPublishedSince(channelId, since);
    if (videos.length === 0) {
      return { videos: 0, avgViews: 0, avgCtr: 0, avgViewPercentage: 0, avgDurationSec: 0 };
    }

    const snapshots = await this.deps.analytics.latestForChannel(
      channelId,
      videos.map((v) => v.id),
    );
    const byVideo = new Map(snapshots.map((s) => [s.videoId, s]));

    let views = 0;
    let ctr = 0;
    let viewPercentage = 0;
    let counted = 0;
    let best: { id: string; views: number } | null = null;
    let worst: { id: string; views: number } | null = null;

    for (const video of videos) {
      const snapshot = byVideo.get(video.id);
      if (!snapshot) continue;
      counted += 1;
      views += snapshot.views;
      ctr += snapshot.ctr;
      viewPercentage += snapshot.averageViewPercentage;
      if (!best || snapshot.views > best.views) best = { id: video.id, views: snapshot.views };
      if (!worst || snapshot.views < worst.views) worst = { id: video.id, views: snapshot.views };
    }

    const durations = videos.map((v) => v.actualDurationSec ?? v.targetDurationSec);
    return {
      videos: counted,
      avgViews: counted ? round(views / counted) : 0,
      avgCtr: counted ? round(ctr / counted) : 0,
      avgViewPercentage: counted ? round(viewPercentage / counted) : 0,
      avgDurationSec: round(durations.reduce((a, b) => a + b, 0) / Math.max(1, durations.length)),
      bestVideoId: best?.id,
      worstVideoId: worst?.id,
    };
  }

  /** Compares prediction with reality for one video and stores what it implies. */
  async learnFrom(video: VideoRecord, snapshot: AnalyticsSnapshotRecord): Promise<number> {
    const [script, thumbnails, seo, baseline] = await Promise.all([
      this.deps.scripts.findByVideo(video.id),
      this.deps.thumbnails.listByVideo(video.id),
      this.deps.seo.findByVideo(video.id),
      this.baseline(video.channelId),
    ]);
    const selected = thumbnails.find((t) => t.selected);

    const predicted: Record<string, number> = {
      ctr: selected?.ctrPotential ?? 0,
      retention: video.retentionScore ?? script?.retentionScore ?? 0,
      quality: video.qualityScore ?? 0,
    };
    const actual: Record<string, number> = {
      ctr: snapshot.ctr,
      averageViewPercentage: snapshot.averageViewPercentage,
      views: snapshot.views,
      watchTimeMinutes: snapshot.watchTimeMinutes,
      subscribersGained: snapshot.subscribersGained,
    };

    const result = await this.deps.agents.analytics.run(
      {
        video: {
          title: seo?.title ?? video.title,
          durationSec: video.actualDurationSec ?? video.targetDurationSec,
          publishedAt: video.publishedAt?.toISOString(),
          structure: script?.structure,
          hook: script?.hook?.slice(0, 200),
          thumbnailVariant: selected?.variant,
        },
        predicted,
        actual,
        channelBaseline: {
          avgViews: baseline.avgViews,
          avgCtr: baseline.avgCtr,
          avgViewPercentage: baseline.avgViewPercentage,
          avgDurationSec: baseline.avgDurationSec,
          videos: baseline.videos,
        },
      },
      { channelId: video.channelId, videoId: video.id },
    );

    const records = result.output.observations.map((observation) => ({
      channelId: video.channelId,
      videoId: video.id,
      dimension: observation.dimension,
      observation: observation.observation,
      predicted: observation.predicted ?? null,
      actual: observation.actual ?? null,
      delta:
        observation.predicted !== undefined && observation.actual !== undefined
          ? round(observation.actual - observation.predicted)
          : null,
      // A single video is weak evidence; the agent's own confidence is scaled by how much
      // history the channel has, so early conclusions cannot dominate later ones.
      weight: round(observation.weight * Math.min(1, (baseline.videos + 1) / 10), 3),
    }));

    // Numeric deltas the agent may not have spelled out are recorded regardless, because
    // "predicted CTR 84, actual 3.1" is the single most useful fact for the next video.
    records.push({
      channelId: video.channelId,
      videoId: video.id,
      dimension: 'thumbnail',
      observation: `Predicted CTR score ${predicted.ctr} versus an actual click-through rate of ${snapshot.ctr}% on ${snapshot.impressions} impressions.`,
      predicted: predicted.ctr ?? null,
      actual: snapshot.ctr,
      delta: round(snapshot.ctr - (predicted.ctr ?? 0)),
      weight: 0.5,
    });
    records.push({
      channelId: video.channelId,
      videoId: video.id,
      dimension: 'hook',
      observation: `Predicted retention ${predicted.retention} versus an actual average-percentage-viewed of ${snapshot.averageViewPercentage}%.`,
      predicted: predicted.retention ?? null,
      actual: snapshot.averageViewPercentage,
      delta: round(snapshot.averageViewPercentage - (predicted.retention ?? 0)),
      weight: 0.6,
    });

    await this.deps.learnings.createMany(records);
    this.logger.info('learnings recorded', {
      videoId: video.id,
      channelId: video.channelId,
      count: records.length,
    });
    return records.length;
  }

  /** The highest-weight learnings, phrased for a prompt. */
  async summarize(channelId: string, limit = 12): Promise<string[]> {
    const learnings = await this.deps.learnings.listByChannel(channelId, 200);
    return [...learnings]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, limit)
      .map((l) => `[${l.dimension}] ${l.observation}`);
  }
}
