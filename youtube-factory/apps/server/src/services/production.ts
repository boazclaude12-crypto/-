import type { Repositories } from '../db/ports.js';
import type { ChannelSettingsRecord, ContentIdeaRecord, VideoRecord } from '../db/types.js';
import type { PipelineRunner } from '../pipeline/runner.js';
import type { Clock } from '../shared/clock.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import type { Logger } from '../shared/logger.js';
import { nullLogger } from '../shared/logger.js';

export interface StartProductionResult {
  video: VideoRecord;
  jobId: string;
  reason: string;
}

/**
 * Turns an approved idea into a video in production (spec §61). One place creates videos,
 * so the length policy, the template link and the idea's status transition can never drift
 * apart between the API, the autopilot and the CLI.
 */
export class ProductionService {
  constructor(
    private readonly deps: {
      repos: Repositories;
      runner: PipelineRunner;
      clock: Clock;
      logger?: Logger;
    },
  ) {}

  private get logger(): Logger {
    return this.deps.logger ?? nullLogger;
  }

  async startFromIdea(
    ideaId: string,
    opts: { templateId?: string; targetDurationSec?: number } = {},
  ): Promise<StartProductionResult> {
    const idea = await this.deps.repos.ideas.findById(ideaId);
    if (!idea) throw new NotFoundError('Idea');
    if (idea.status === 'IN_PRODUCTION' || idea.status === 'PRODUCED') {
      throw new ConflictError('That idea is already in production');
    }

    const settings = await this.deps.repos.channelSettings.findByChannel(idea.channelId);
    if (!settings) throw new NotFoundError('Channel settings');

    const targetDurationSec = opts.targetDurationSec ?? chooseDuration(idea, settings);

    const video = await this.deps.repos.videos.create({
      channelId: idea.channelId,
      ideaId: idea.id,
      templateId: opts.templateId ?? null,
      title: idea.title,
      status: 'IDEA',
      previousStatus: null,
      progress: {},
      targetDurationSec,
      actualDurationSec: null,
      language: settings.language,
      renderKey: null,
      renderWidth: null,
      renderHeight: null,
      fileSizeBytes: null,
      qualityScore: null,
      qualityBreakdown: null,
      factConfidence: null,
      retentionScore: null,
      estimatedCostUsd: idea.productionCostUsd,
      actualCostUsd: 0,
      failureReason: null,
      publishAt: null,
      publishedAt: null,
      youtubeVideoId: null,
    });

    await this.deps.repos.ideas.update(idea.id, { status: 'IN_PRODUCTION' });

    const reason = `Selected idea "${idea.title}" (score ${idea.overallScore}: demand ${idea.estimatedDemand}, trend ${idea.trendScore}, competition ${idea.competition}, predicted CTR ${idea.estimatedCtr}, predicted retention ${idea.estimatedRetention}); target runtime ${Math.round(
      targetDurationSec / 60,
    )} minutes.`;

    await this.deps.repos.decisions.record({
      videoId: video.id,
      channelId: idea.channelId,
      subject: 'Production started',
      decision: idea.title,
      reason,
      score: idea.overallScore,
      dataUsed: {
        ideaId: idea.id,
        scoreBreakdown: idea.scoreBreakdown,
        targetDurationSec,
      },
    });

    const jobId = await this.deps.runner.enqueue(video.id, { reason: 'production started' });
    this.logger.info('production started', {
      videoId: video.id,
      channelId: idea.channelId,
      ideaId: idea.id,
      targetDurationSec,
    });

    return { video, jobId, reason };
  }

  /** Approves a video that was waiting at a gate and lets the pipeline continue. */
  async approve(videoId: string): Promise<VideoRecord> {
    const video = await this.deps.repos.videos.findById(videoId);
    if (!video) throw new NotFoundError('Video');
    await this.deps.runner.enqueue(videoId, { reason: 'approved by user', expectStatus: video.status });
    return video;
  }

  /** Rejects a video: releases its slot and marks it failed with an explicit reason. */
  async reject(videoId: string, reason: string): Promise<VideoRecord> {
    const video = await this.deps.repos.videos.findById(videoId);
    if (!video) throw new NotFoundError('Video');
    const updated = await this.deps.repos.videos.update(videoId, {
      status: 'FAILED',
      previousStatus: video.status,
      failureReason: `Rejected: ${reason}`,
    });
    if (video.ideaId) await this.deps.repos.ideas.update(video.ideaId, { status: 'REJECTED' });
    return updated;
  }
}

/**
 * Runtime policy (spec §55): the channel's target is the starting point, adjusted by how
 * much the topic can actually carry. Depth comes from the idea's own scores rather than
 * from a wish to hit a number — padding is what the specification explicitly forbids.
 */
export function chooseDuration(idea: ContentIdeaRecord, settings: ChannelSettingsRecord): number {
  const base = settings.targetDurationMin * 60;
  const depth = (idea.estimatedDemand + idea.evergreenScore + idea.novelty) / 3;
  const retention = idea.estimatedRetention;

  // A topic that scores low on depth cannot support a long video; one that scores high on
  // both depth and predicted retention can carry more.
  let factor = 1;
  if (depth < 45) factor = 0.7;
  else if (depth < 60) factor = 0.85;
  else if (depth > 80 && retention > 70) factor = 1.25;
  else if (depth > 70) factor = 1.1;

  const seconds = Math.round((base * factor) / 60) * 60;
  return Math.max(240, Math.min(3600, seconds));
}
