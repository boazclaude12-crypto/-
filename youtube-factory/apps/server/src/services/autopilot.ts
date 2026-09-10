import type { Agents } from '../agents/index.js';
import type { Repositories } from '../db/ports.js';
import type { ChannelRecord, ChannelSettingsRecord } from '../db/types.js';
import type { PipelineRunner } from '../pipeline/runner.js';
import type { Clock } from '../shared/clock.js';
import { errorMessage } from '../shared/errors.js';
import type { Logger } from '../shared/logger.js';
import { nullLogger } from '../shared/logger.js';
import { startOfUtcWeek } from '../shared/time.js';
import type { BudgetGuard } from './budget.js';
import type { IdeaService } from './ideas.js';
import type { LearningEngine } from './learning.js';
import type { Notifier } from './notifications.js';
import type { ProductionService } from './production.js';
import type { SchedulingEngine } from './scheduler.js';

export interface BufferState {
  published7d: number;
  scheduled: number;
  ready: number;
  inProduction: number;
  /** How many more videos are needed to keep the pipeline full. */
  deficit: number;
  target: number;
}

export interface AutopilotResult {
  channelId: string;
  ran: boolean;
  reason: string;
  ideasGenerated: number;
  productionsStarted: string[];
  buffer: BufferState;
}

const ACTIVE_STATUSES = [
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
] as const;

/**
 * Autopilot (spec §62, §63).
 *
 * Once a day per channel: crawl sources, generate and score ideas, decide how many videos
 * the buffer needs, and start exactly that many — never more than the channel's declared
 * weekly output, and never past the monthly budget.
 */
export class Autopilot {
  constructor(
    private readonly deps: {
      repos: Repositories;
      ideas: IdeaService;
      production: ProductionService;
      scheduler: SchedulingEngine;
      budget: BudgetGuard;
      learning: LearningEngine;
      agents: Agents;
      notifier: Notifier;
      runner: PipelineRunner;
      clock: Clock;
      logger?: Logger;
    },
  ) {}

  private get logger(): Logger {
    return this.deps.logger ?? nullLogger;
  }

  /** Buffer health for a channel (spec §63). */
  async buffer(channel: ChannelRecord, settings: ChannelSettingsRecord): Promise<BufferState> {
    const counts = await this.deps.repos.videos.countByStatus(channel.id);
    const weekAgo = new Date(this.deps.clock.now().getTime() - 7 * 86_400_000);
    const published = await this.deps.repos.videos.listPublishedSince(channel.id, weekAgo);

    const inProduction = ACTIVE_STATUSES.reduce((sum, status) => sum + (counts[status] ?? 0), 0);
    const scheduled = counts.SCHEDULED ?? 0;
    const ready = counts.READY ?? 0;

    // Keep enough finished and in-flight work to cover the next `bufferTargetVideos` slots
    // plus this week's output.
    const target = settings.videosPerWeek + settings.bufferTargetVideos;
    const have = scheduled + ready + inProduction;

    return {
      published7d: published.length,
      scheduled,
      ready,
      inProduction,
      target,
      deficit: Math.max(0, target - have),
    };
  }

  async runForChannel(channelId: string, opts: { force?: boolean; maxStarts?: number } = {}): Promise<AutopilotResult> {
    const channel = await this.deps.repos.channels.findById(channelId);
    const settings = channel ? await this.deps.repos.channelSettings.findByChannel(channelId) : null;
    if (!channel || !settings) {
      return {
        channelId,
        ran: false,
        reason: 'Channel or settings not found.',
        ideasGenerated: 0,
        productionsStarted: [],
        buffer: emptyBuffer(),
      };
    }

    const buffer = await this.buffer(channel, settings);

    if (!opts.force) {
      if (!channel.enabled) {
        return { channelId, ran: false, reason: 'Channel is disabled.', ideasGenerated: 0, productionsStarted: [], buffer };
      }
      if (!settings.autopilotEnabled) {
        return { channelId, ran: false, reason: 'Autopilot is off for this channel.', ideasGenerated: 0, productionsStarted: [], buffer };
      }
    }

    const budget = await this.deps.budget.status(channelId);
    if (budget.blocked) {
      await this.deps.notifier.notify(channel.userId, {
        event: 'BUDGET_EXCEEDED',
        title: `Autopilot paused for ${channel.name}`,
        body: `The $${budget.budgetUsd.toFixed(2)} monthly budget is spent. No new productions will start until it is raised or the month rolls over.`,
        meta: { channelId },
      });
      return {
        channelId,
        ran: true,
        reason: 'Monthly budget exhausted — no new productions started.',
        ideasGenerated: 0,
        productionsStarted: [],
        buffer,
      };
    }

    // Weekly cap (spec §62): never produce more than the channel asked for.
    const startedThisWeek = await this.startedSince(channelId, startOfUtcWeek(this.deps.clock.now()));
    const weeklyRemaining = Math.max(0, settings.videosPerWeek - startedThisWeek);
    const maxStarts = Math.min(opts.maxStarts ?? buffer.deficit, weeklyRemaining, 3);

    if (maxStarts <= 0) {
      return {
        channelId,
        ran: true,
        reason:
          weeklyRemaining <= 0
            ? `This week's output of ${settings.videosPerWeek} videos is already in flight.`
            : `Buffer is healthy — ${buffer.scheduled} scheduled, ${buffer.ready} ready, ${buffer.inProduction} in production against a target of ${buffer.target}.`,
        ideasGenerated: 0,
        productionsStarted: [],
        buffer,
      };
    }

    // 1. Refresh ideas when there are not enough good ones on the shelf.
    let ideasGenerated = 0;
    const available = await this.deps.repos.ideas.listByChannel(channelId, { status: 'APPROVED' });
    const usable = available.filter((i) => i.overallScore >= settings.minIdeaScore);
    if (usable.length < maxStarts) {
      try {
        const generated = await this.deps.ideas.generate(channel, settings, {
          count: Math.max(5, maxStarts * 2),
          autoApprove: settings.automationMode === 'FULL_AUTO',
        });
        ideasGenerated = generated.ideas.length;

        if (settings.automationMode !== 'FULL_AUTO') {
          await this.deps.notifier.notify(channel.userId, {
            event: 'IDEA_READY',
            title: `${generated.ideas.length} ideas ready for ${channel.name}`,
            body: generated.ideas
              .slice(0, 5)
              .map((i) => `• ${i.title} (${i.overallScore})`)
              .join('\n'),
            url: `${''}/ideas?channel=${channelId}`,
            actions: [{ label: 'Review ideas', command: `ideas:${channelId}` }],
            meta: { channelId },
          });
        }
      } catch (err) {
        this.logger.error('autopilot idea generation failed', {
          channelId,
          error: errorMessage(err),
        });
      }
    }

    // 2. In manual and semi-auto modes the user picks; autopilot stops here.
    if (settings.automationMode === 'MANUAL') {
      return {
        channelId,
        ran: true,
        reason: 'Channel is in MANUAL mode — ideas were refreshed and are waiting for your selection.',
        ideasGenerated,
        productionsStarted: [],
        buffer,
      };
    }

    // 3. Start production on the best ideas.
    const started: string[] = [];
    for (let i = 0; i < maxStarts; i += 1) {
      const idea = await this.deps.ideas.pickBest(channelId, settings);
      if (!idea) break;
      try {
        const result = await this.deps.production.startFromIdea(idea.id);
        started.push(result.video.id);
        this.logger.info('autopilot started production', {
          channelId,
          videoId: result.video.id,
          ideaId: idea.id,
          score: idea.overallScore,
        });
      } catch (err) {
        this.logger.warn('autopilot could not start production', {
          channelId,
          ideaId: idea.id,
          error: errorMessage(err),
        });
        break;
      }
    }

    return {
      channelId,
      ran: true,
      reason: started.length
        ? `Started ${started.length} production${started.length === 1 ? '' : 's'} to close a buffer deficit of ${buffer.deficit}.`
        : 'No idea met the channel’s minimum score.',
      ideasGenerated,
      productionsStarted: started,
      buffer: await this.buffer(channel, settings),
    };
  }

  /** Sweeps every enabled channel — the shape the daily cron job takes. */
  async runAll(): Promise<AutopilotResult[]> {
    const channels = await this.deps.repos.channels.listEnabled();
    const results: AutopilotResult[] = [];
    for (const channel of channels) {
      try {
        results.push(await this.runForChannel(channel.id));
      } catch (err) {
        this.logger.error('autopilot failed for channel', {
          channelId: channel.id,
          error: errorMessage(err),
        });
      }
    }
    return results;
  }

  /**
   * Publishes videos whose scheduled slot has arrived. Runs on a short interval — this is
   * what actually turns SCHEDULED into PUBLISHED.
   */
  async publishDue(): Promise<string[]> {
    const due = await this.deps.repos.videos.listDueForPublish(this.deps.clock.now(), 25);
    const started: string[] = [];
    for (const video of due) {
      await this.deps.runner.enqueue(video.id, { reason: 'publish slot reached', expectStatus: 'SCHEDULED' });
      started.push(video.id);
    }
    return started;
  }

  /** Weekly strategy pass (spec §36, §78). */
  async runWeeklyStrategy(channelId: string): Promise<{ summary: string; recommendations: number } | null> {
    const channel = await this.deps.repos.channels.findById(channelId);
    const settings = channel ? await this.deps.repos.channelSettings.findByChannel(channelId) : null;
    if (!channel || !settings) return null;

    const since = new Date(this.deps.clock.now().getTime() - 120 * 86_400_000);
    const published = await this.deps.repos.videos.listPublishedSince(channelId, since);
    const recent = published.slice(0, 20);
    const snapshots = await this.deps.repos.analytics.latestForChannel(
      channelId,
      recent.map((v) => v.id),
    );
    const byVideo = new Map(snapshots.map((s) => [s.videoId, s]));
    const baseline = await this.deps.learning.baseline(channelId);
    const learnings = await this.deps.learning.summarize(channelId, 15);
    const weekAgo = new Date(this.deps.clock.now().getTime() - 7 * 86_400_000);
    const signals = await this.deps.repos.discovery.recentSignals(channelId, weekAgo, 20);
    const competitors = await this.deps.repos.competitors.listByChannel(channelId);

    const result = await this.deps.agents.strategy.run(
      {
        videosPerWeek: settings.videosPerWeek,
        recentVideos: recent.map((v) => {
          const snapshot = byVideo.get(v.id);
          return {
            title: v.title,
            publishedAt: v.publishedAt?.toISOString(),
            views: snapshot?.views,
            ctr: snapshot?.ctr,
            averageViewPercentage: snapshot?.averageViewPercentage,
            durationSec: v.actualDurationSec ?? v.targetDurationSec,
          };
        }),
        analytics: {
          avgViews: baseline.avgViews,
          avgCtr: baseline.avgCtr,
          avgViewPercentage: baseline.avgViewPercentage,
          avgDurationSec: baseline.avgDurationSec,
        },
        competitors: competitors.map((c) => c.name),
        trends: signals.map((s) => s.topic),
        learnings,
      },
      { channelId },
    );

    await this.deps.repos.strategies.upsert({
      channelId,
      weekStart: startOfUtcWeek(this.deps.clock.now()),
      summary: result.output.summary,
      recommendations: result.output.recommendations,
      mix: result.output.mix,
    });

    return { summary: result.output.summary, recommendations: result.output.recommendations.length };
  }

  private async startedSince(channelId: string, since: Date): Promise<number> {
    const page = await this.deps.repos.videos.listByChannel(channelId, { limit: 200 });
    return page.items.filter((v) => v.createdAt >= since && v.status !== 'FAILED').length;
  }
}

function emptyBuffer(): BufferState {
  return { published7d: 0, scheduled: 0, ready: 0, inProduction: 0, deficit: 0, target: 0 };
}
