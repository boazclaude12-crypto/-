import type { AssetRepository, DecisionRepository, UsageRepository } from '../db/ports.js';
import type { SceneRecord } from '../db/types.js';
import type { ProviderRegistry } from '../providers/registry.js';
import type { QualityTier } from '../providers/types.js';
import { usd, type Money, type SceneStrategy } from '../shared/types.js';
import type { BudgetStatus } from './budget.js';

export interface StrategyCost {
  strategy: SceneStrategy;
  cost: Money;
  available: boolean;
  detail: string;
}

export interface OptimizedChoice {
  strategy: SceneStrategy;
  quality: QualityTier;
  cost: Money;
  reason: string;
  alternatives: StrategyCost[];
}

/**
 * Cost optimisation (spec §19). Before any generation the optimiser asks whether the same
 * outcome can be had for less: reuse an asset that already exists, use a still with camera
 * motion instead of generated video, or drop a tier when the budget is tight.
 *
 * Scene importance is the deciding input. Full video generation is reserved for the shots
 * that carry the video; everything else gets image-plus-motion, which costs a fraction and
 * for most B-roll is indistinguishable.
 */
export class CostOptimizer {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly assets: AssetRepository,
    private readonly decisions: DecisionRepository,
  ) {}

  /** What each production route would cost for this scene. */
  costsFor(scene: Pick<SceneRecord, 'durationSec' | 'importance'>, quality: QualityTier = 'standard'): StrategyCost[] {
    const imageChain = this.registry.chain({
      capability: 'generateImage',
      estimate: { capability: 'generateImage', images: 1, quality },
    });
    const videoChain = this.registry.chain({
      capability: 'generateVideo',
      estimate: { capability: 'generateVideo', seconds: scene.durationSec, quality },
    });

    const imageCost = imageChain[0]?.estimatedCost ?? usd(0);
    const videoCost = videoChain[0]?.estimatedCost ?? usd(0);

    return [
      {
        strategy: 'EXISTING_MEDIA',
        cost: usd(0),
        available: true,
        detail: 'Reuse an asset already produced for this video.',
      },
      {
        strategy: 'STOCK',
        cost: usd(0),
        available: true,
        detail: 'Use a licensed asset already in the library.',
      },
      {
        strategy: 'IMAGE_MOTION',
        cost: imageCost,
        available: imageChain.length > 0,
        detail: 'Generate one still, then animate it with camera motion.',
      },
      {
        strategy: 'GENERATED_VIDEO',
        cost: videoCost,
        available: videoChain.length > 0,
        detail: `Full generative video for ${scene.durationSec.toFixed(1)}s.`,
      },
    ];
  }

  /**
   * Picks the cheapest route that still serves the scene. Deterministic and explainable —
   * this is a spend decision, so it does not go to a model unless the caller asks it to.
   */
  async choose(
    scene: Pick<SceneRecord, 'id' | 'videoId' | 'durationSec' | 'importance' | 'prompt'>,
    opts: { budget: BudgetStatus; videoBudgetRemainingUsd: number; channelId: string; quality?: QualityTier },
  ): Promise<OptimizedChoice> {
    const quality: QualityTier = opts.budget.degrade ? 'draft' : opts.quality ?? 'standard';
    const alternatives = this.costsFor(scene, quality);
    const byStrategy = new Map(alternatives.map((a) => [a.strategy, a]));

    // 1. An identical prompt already rendered for this video costs nothing to reuse.
    const existing = await this.assets.findByChecksum(promptChecksum(scene.videoId, scene.prompt));
    if (existing) {
      return this.record(scene, {
        strategy: 'EXISTING_MEDIA',
        quality,
        cost: usd(0),
        reason: `An asset for an identical prompt already exists (${existing.id}); reusing it saves a generation call.`,
        alternatives,
      }, opts.channelId);
    }

    const video = byStrategy.get('GENERATED_VIDEO');
    const image = byStrategy.get('IMAGE_MOTION');

    // 2. Full video generation only for shots that carry the video, and only if affordable.
    const wantsVideo = scene.importance >= 0.7;
    const affordable =
      video?.available === true &&
      video.cost.usd <= opts.videoBudgetRemainingUsd &&
      !opts.budget.blocked &&
      !opts.budget.degrade;

    if (wantsVideo && affordable && video) {
      return this.record(scene, {
        strategy: 'GENERATED_VIDEO',
        quality,
        cost: video.cost,
        reason: `Scene importance ${scene.importance.toFixed(
          2,
        )} justifies generated video at $${video.cost.usd.toFixed(4)}; $${opts.videoBudgetRemainingUsd.toFixed(
          2,
        )} of this video's budget remains.`,
        alternatives,
      }, opts.channelId);
    }

    // 3. Otherwise a still plus motion — a fraction of the cost, and always available.
    if (image?.available) {
      const why = wantsVideo
        ? video?.available
          ? `generated video would cost $${video.cost.usd.toFixed(4)} against $${opts.videoBudgetRemainingUsd.toFixed(
              2,
            )} remaining${opts.budget.degrade ? ' and the channel is over 90% of its monthly budget' : ''}`
          : 'no video provider is configured'
        : `scene importance is ${scene.importance.toFixed(2)}, below the 0.7 threshold for generated video`;
      return this.record(scene, {
        strategy: 'IMAGE_MOTION',
        quality,
        cost: image.cost,
        reason: `Chose image + camera motion at $${image.cost.usd.toFixed(4)} because ${why}.`,
        alternatives,
      }, opts.channelId);
    }

    // 4. Last resort: the always-available local generator.
    return this.record(scene, {
      strategy: 'STOCK',
      quality: 'draft',
      cost: usd(0),
      reason: 'No generative visual provider is available; falling back to a locally rendered plate.',
      alternatives,
    }, opts.channelId);
  }

  private async record(
    scene: { id: string; videoId: string },
    choice: OptimizedChoice,
    channelId: string,
  ): Promise<OptimizedChoice> {
    await this.decisions.record({
      videoId: scene.videoId,
      channelId,
      subject: `Visual strategy for scene ${scene.id}`,
      decision: choice.strategy,
      reason: choice.reason,
      score: null,
      dataUsed: {
        quality: choice.quality,
        alternatives: choice.alternatives.map((a) => ({
          strategy: a.strategy,
          costUsd: a.cost.usd,
          available: a.available,
        })),
      },
    });
    return choice;
  }
}

/** Cost reporting for the dashboard (spec §41). */
export class CostReporter {
  constructor(private readonly usage: UsageRepository) {}

  async forVideo(videoId: string): Promise<number> {
    return this.usage.sumForVideo(videoId);
  }

  async monthly(from: Date, to: Date, channelId?: string) {
    const byProvider = await this.usage.breakdownByProvider(from, to, channelId);
    const total = byProvider.reduce((sum, p) => sum + p.cost, 0);
    return { total: round(total), byProvider };
  }

  async costPerMinute(videoId: string, durationSec: number): Promise<number> {
    if (durationSec <= 0) return 0;
    const total = await this.usage.sumForVideo(videoId);
    return round((total / durationSec) * 60, 4);
  }
}

/** Stable identity for "the same visual asked for twice" within one video. */
export function promptChecksum(videoId: string, prompt: string): string {
  let hash = 2166136261;
  const input = `${videoId}:${prompt}`;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `prompt-${(hash >>> 0).toString(16)}`;
}

function round(n: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
