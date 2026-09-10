import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PipelineStep, StepContext, StepResult } from '../context.js';
import { promptChecksum } from '../../services/cost.js';
import { StorageKeys } from '../../storage/index.js';
import { PipelineError, errorMessage } from '../../shared/errors.js';
import { splitDeterministically } from '../../agents/scene.js';
import { shiftTimings, synthesizeTimings, buildCues, toSrt, toVtt } from '../../media/captions.js';
import type { GeneratedMedia, ImageCapable, VideoCapable, VoiceCapable } from '../../providers/types.js';
import { meter } from '../../providers/registry.js';
import type { SceneStrategy } from '../../shared/types.js';

/** SCENE_PLANNING → GENERATING_VISUALS. Turns the script into a shot list (spec §16). */
export const scenePlanStep: PipelineStep = {
  name: 'scene-plan',
  from: 'SCENE_PLANNING',
  running: 'SCENE_PLANNING',

  async execute(ctx: StepContext): Promise<StepResult> {
    const script = await ctx.repos.scripts.findByVideo(ctx.video.id);
    if (!script) throw new PipelineError('No script to break into scenes');

    const characters = await ctx.repos.characters.listByChannel(ctx.channel.id);
    await ctx.reportProgress(15);

    const result = await ctx.agents.scene.run(
      {
        script: {
          title: ctx.video.title,
          structure: script.structure,
          hook: script.hook,
          intro: script.intro,
          sections: script.sections,
          cta: script.cta,
          estimatedDurationSec: script.estimatedDuration,
        },
        visualStyle: ctx.settings.visualStyle,
        aspectRatio: '16:9',
        sceneDurationSec: 7,
        language: ctx.settings.language,
        characters: characters.map((c) => ({
          name: c.name,
          age: c.age ?? undefined,
          gender: c.gender ?? undefined,
          clothing: c.clothing ?? undefined,
          hair: c.hair ?? undefined,
          face: c.face ?? undefined,
          bodyType: c.bodyType ?? undefined,
          style: c.style ?? undefined,
        })),
      },
      { channelId: ctx.channel.id, videoId: ctx.video.id, jobId: ctx.jobId, signal: ctx.signal },
    );

    await ctx.reportProgress(70);

    // A character introduced by the scene planner becomes part of the channel's bible, so
    // the next video keeps the same person consistent (spec §17).
    for (const character of result.output.characterBible) {
      await ctx.repos.characters.upsert(ctx.channel.id, {
        name: character.name,
        age: character.age ?? null,
        gender: character.gender ?? null,
        clothing: character.clothing ?? null,
        hair: character.hair ?? null,
        face: character.face ?? null,
        bodyType: character.bodyType ?? null,
        style: character.style ?? null,
        referenceKey: null,
      });
    }

    await ctx.repos.scenes.replaceAll(
      ctx.video.id,
      result.output.scenes.map((scene) => ({
        index: scene.index,
        durationSec: scene.durationSec,
        narration: scene.narration,
        visualBrief: scene.visualBrief,
        prompt: scene.prompt,
        negativePrompt: scene.negativePrompt ?? null,
        camera: scene.camera ?? null,
        style: scene.style ?? null,
        aspectRatio: scene.aspectRatio,
        characters: scene.characters,
        location: scene.location ?? null,
        lighting: scene.lighting ?? null,
        motion: scene.motion ?? null,
        continuityNotes: scene.continuityNotes ?? null,
        textOverlay: scene.textOverlay ?? null,
        sfx: scene.sfx ?? null,
        importance: scene.importance,
        strategy: 'IMAGE_MOTION' as SceneStrategy,
        assetId: null,
      })),
    );

    await ctx.reportProgress(100);
    return {
      status: 'GENERATING_VISUALS',
      note: `${result.output.scenes.length} scenes planned`,
    };
  },
};

/** GENERATING_VISUALS → GENERATING_VOICE. Produces one visual per scene (spec §18, §19). */
export const visualsStep: PipelineStep = {
  name: 'visuals',
  from: 'GENERATING_VISUALS',
  running: 'GENERATING_VISUALS',

  async execute(ctx: StepContext): Promise<StepResult> {
    const scenes = await ctx.repos.scenes.listByVideo(ctx.video.id);
    if (scenes.length === 0) throw new PipelineError('No scenes to produce visuals for');

    const budgetStatus = await ctx.budget.status(ctx.channel.id);
    const videoBudget = await ctx.budget.videoBudget(ctx.channel.id);
    const spentSoFar = await ctx.repos.usage.sumForVideo(ctx.video.id);
    let remaining = Math.max(0, videoBudget - spentSoFar);

    const { width, height } = ctx.config.media;
    let produced = 0;
    let fallbacks = 0;

    for (const scene of scenes) {
      const choice = await ctx.costs.choose(scene, {
        budget: budgetStatus,
        videoBudgetRemainingUsd: remaining,
        channelId: ctx.channel.id,
        quality: budgetStatus.degrade ? 'draft' : 'standard',
      });

      const checksum = promptChecksum(ctx.video.id, scene.prompt);
      if (choice.strategy === 'EXISTING_MEDIA') {
        const existing = await ctx.repos.assets.findByChecksum(checksum);
        if (existing) {
          await ctx.repos.scenes.update(scene.id, { strategy: 'EXISTING_MEDIA', assetId: existing.id });
          produced += 1;
          await ctx.reportProgress(Math.round((produced / scenes.length) * 100));
          continue;
        }
      }

      let media: GeneratedMedia | null = null;
      let providerKey = 'local';
      let costUsd = 0;
      let strategy: SceneStrategy = choice.strategy;

      try {
        if (choice.strategy === 'GENERATED_VIDEO') {
          // Video models here are image-to-video, so the still is generated first and then
          // animated — which is also what makes the still reusable if the video call fails.
          const still = await generateImage(ctx, scene.prompt, scene.negativePrompt ?? null, width, height, choice.quality);
          const stillPath = join(ctx.workDir, `scene-${scene.index}-still.png`);
          await writeFile(stillPath, still.media.bytes ?? Buffer.alloc(0));
          costUsd += still.costUsd;

          const clip = await generateVideo(
            ctx,
            {
              prompt: scene.prompt,
              negativePrompt: scene.negativePrompt ?? undefined,
              imageUrl: still.media.url ?? `file://${stillPath}`,
              durationSec: scene.durationSec,
              aspectRatio: scene.aspectRatio,
              motion: scene.motion ?? undefined,
              quality: choice.quality,
            },
          );
          media = clip.media;
          providerKey = clip.providerKey;
          costUsd += clip.costUsd;
        } else {
          const still = await generateImage(ctx, scene.prompt, scene.negativePrompt ?? null, width, height, choice.quality);
          media = still.media;
          providerKey = still.providerKey;
          costUsd = still.costUsd;
          strategy = 'IMAGE_MOTION';
        }
      } catch (err) {
        // Provider chain exhausted for this scene: fall back to a locally rendered plate
        // rather than failing the whole video (spec §64).
        ctx.logger.warn('scene visual generation failed, falling back to local plate', {
          videoId: ctx.video.id,
          scene: scene.index,
          error: errorMessage(err),
        });
        const local = ctx.registry.get('local') as (ImageCapable & { key: string }) | undefined;
        if (!local) throw err;
        const plate = await local.generateImage({ prompt: scene.prompt, width, height, count: 1 });
        media = plate.images[0] ?? null;
        providerKey = 'local';
        costUsd = 0;
        strategy = 'STOCK';
        fallbacks += 1;
      }

      if (!media?.bytes) throw new PipelineError(`Scene ${scene.index} produced no usable media`);

      const isVideo = media.mimeType.startsWith('video/');
      const ext = isVideo ? 'mp4' : media.mimeType.includes('png') ? 'png' : 'jpg';
      const key = StorageKeys.visual(ctx.channel.id, ctx.video.id, scene.index, ext);
      const stored = await ctx.storage.put(key, media.bytes, media.mimeType);

      const asset = await ctx.repos.assets.create({
        videoId: ctx.video.id,
        kind: isVideo ? 'VIDEO' : 'IMAGE',
        storageKey: stored.key,
        mimeType: media.mimeType,
        bytes: stored.bytes,
        durationSec: media.durationSec ?? null,
        width: media.width ?? width,
        height: media.height ?? height,
        provider: providerKey,
        externalId: media.externalId ?? null,
        costUsd,
        license: providerKey === 'local' ? 'owned' : 'generated',
        attribution: null,
        checksum,
        metadata: { sceneIndex: scene.index, strategy, prompt: scene.prompt },
      });

      await ctx.repos.scenes.update(scene.id, { strategy, assetId: asset.id });
      remaining = Math.max(0, remaining - costUsd);
      produced += 1;
      await ctx.reportProgress(Math.round((produced / scenes.length) * 100));
    }

    return {
      status: 'GENERATING_VOICE',
      note: `${produced} visuals produced${fallbacks ? `, ${fallbacks} via local fallback` : ''}`,
    };
  },
};

/** GENERATING_VOICE → EDITING. Narration plus word-accurate subtitles (spec §20, §21). */
export const voiceStep: PipelineStep = {
  name: 'voice',
  from: 'GENERATING_VOICE',
  running: 'GENERATING_VOICE',

  async execute(ctx: StepContext): Promise<StepResult> {
    const script = await ctx.repos.scripts.findByVideo(ctx.video.id);
    if (!script) throw new PipelineError('No script to narrate');

    const scriptDraft = {
      title: ctx.video.title,
      structure: script.structure,
      hook: script.hook,
      intro: script.intro,
      sections: script.sections,
      cta: script.cta,
      estimatedDurationSec: script.estimatedDuration,
    };

    let segments;
    try {
      const planned = await ctx.agents.voice.run(
        {
          script: scriptDraft,
          language: ctx.settings.language,
          voiceProfile: ctx.settings.voiceId ?? 'warm documentary narrator',
          maxCharsPerSegment: 900,
        },
        { channelId: ctx.channel.id, videoId: ctx.video.id, jobId: ctx.jobId, signal: ctx.signal },
      );
      segments = planned.output.segments;
    } catch (err) {
      // Segmentation is mechanical; if the agent is unavailable, split deterministically
      // rather than losing the narration entirely.
      ctx.logger.warn('voice agent unavailable, splitting narration deterministically', {
        videoId: ctx.video.id,
        error: errorMessage(err),
      });
      const narration = [script.hook, script.intro, ...script.sections.map((s) => s.narration), script.cta].join('\n\n');
      segments = splitDeterministically(narration, 900);
    }

    const voiceChain = ctx.registry.chain({
      capability: 'generateVoice',
      estimate: {
        capability: 'generateVoice',
        characters: segments.reduce((n, s) => n + s.text.length, 0),
      },
    });
    if (voiceChain.length === 0) throw new PipelineError('No configured text-to-speech provider', undefined, false);

    await mkdir(join(ctx.workDir, 'audio'), { recursive: true });
    const records: Array<{
      index: number;
      text: string;
      storageKey: string;
      durationSec: number;
      provider: string;
      voiceId: string;
      wordTimings: Array<{ word: string; start: number; end: number }>;
      costUsd: number;
    }> = [];

    let offset = 0;
    const allTimings: Array<{ word: string; start: number; end: number }> = [];

    for (const [i, segment] of segments.entries()) {
      let produced: Awaited<ReturnType<VoiceCapable['generateVoice']>> | null = null;
      let providerKey = '';
      let lastError: unknown;

      for (const candidate of voiceChain) {
        const provider = candidate.entry.provider as unknown as VoiceCapable;
        try {
          produced = await meter(
            { usage: ctx.repos.usage },
            {
              providerKey: candidate.entry.provider.key,
              operation: 'tts',
              ctx: { channelId: ctx.channel.id, videoId: ctx.video.id, jobId: ctx.jobId },
              estimated: candidate.estimatedCost,
              registry: ctx.registry,
            },
            () =>
              provider.generateVoice(
                {
                  text: segment.text,
                  voiceId: ctx.settings.voiceId ?? '',
                  language: ctx.settings.language,
                  settings: (ctx.settings.voiceSettings ?? undefined) as never,
                  previousText: segments[i - 1]?.text,
                  nextText: segments[i + 1]?.text,
                },
                { channelId: ctx.channel.id, videoId: ctx.video.id, jobId: ctx.jobId, signal: ctx.signal },
              ),
          );
          providerKey = candidate.entry.provider.key;
          break;
        } catch (err) {
          lastError = err;
          ctx.logger.warn('tts provider failed, trying the next in the chain', {
            videoId: ctx.video.id,
            provider: candidate.entry.provider.key,
            error: errorMessage(err),
          });
        }
      }
      if (!produced) throw lastError ?? new PipelineError('Every text-to-speech provider failed');

      const ext = produced.mimeType.includes('mpeg') ? 'mp3' : produced.mimeType.includes('wav') ? 'wav' : 'm4a';
      const key = StorageKeys.audio(ctx.channel.id, ctx.video.id, i, ext);
      await ctx.storage.put(key, produced.audio, produced.mimeType);

      const timings = produced.wordTimings.length
        ? shiftTimings(produced.wordTimings, offset)
        : synthesizeTimings(segment.text, offset, produced.durationSec);
      allTimings.push(...timings);

      records.push({
        index: i,
        text: segment.text,
        storageKey: key,
        durationSec: produced.durationSec,
        provider: providerKey,
        voiceId: ctx.settings.voiceId ?? 'default',
        wordTimings: timings,
        costUsd: produced.usage.cost.usd,
      });

      // A short pause between segments keeps the delivery from sounding spliced.
      offset += produced.durationSec + (segment.pauseAfterMs ?? 300) / 1000;
      await ctx.reportProgress(Math.round(((i + 1) / segments.length) * 90));
    }

    await ctx.repos.voiceovers.replaceAll(ctx.video.id, records);

    const cues = buildCues(allTimings);
    const srtKey = StorageKeys.captions(ctx.channel.id, ctx.video.id, 'srt');
    const vttKey = StorageKeys.captions(ctx.channel.id, ctx.video.id, 'vtt');
    await ctx.storage.put(srtKey, toSrt(cues), 'application/x-subrip');
    await ctx.storage.put(vttKey, toVtt(cues), 'text/vtt');
    await ctx.repos.assets.create({
      videoId: ctx.video.id,
      kind: 'CAPTION',
      storageKey: srtKey,
      mimeType: 'application/x-subrip',
      bytes: null,
      durationSec: offset,
      width: null,
      height: null,
      provider: 'internal',
      externalId: null,
      costUsd: 0,
      license: 'owned',
      attribution: null,
      checksum: null,
      metadata: { cues: cues.length, vttKey },
    });

    await ctx.reportProgress(100);
    return {
      status: 'EDITING',
      note: `${records.length} narration segments, ${cues.length} subtitle cues, ${offset.toFixed(0)}s of audio`,
    };
  },
};

async function generateImage(
  ctx: StepContext,
  prompt: string,
  negativePrompt: string | null,
  width: number,
  height: number,
  quality: 'draft' | 'standard' | 'premium',
): Promise<{ media: GeneratedMedia; providerKey: string; costUsd: number }> {
  const chain = ctx.registry.chain({
    capability: 'generateImage',
    estimate: { capability: 'generateImage', images: 1, quality },
  });
  let lastError: unknown;
  for (const candidate of chain) {
    const provider = candidate.entry.provider as unknown as ImageCapable;
    try {
      const result = await meter(
        { usage: ctx.repos.usage },
        {
          providerKey: candidate.entry.provider.key,
          operation: 'image',
          ctx: { channelId: ctx.channel.id, videoId: ctx.video.id, jobId: ctx.jobId },
          estimated: candidate.estimatedCost,
          registry: ctx.registry,
        },
        () =>
          provider.generateImage(
            {
              prompt,
              negativePrompt: negativePrompt ?? undefined,
              width,
              height,
              count: 1,
              style: ctx.settings.visualStyle,
              quality,
            },
            { channelId: ctx.channel.id, videoId: ctx.video.id, jobId: ctx.jobId, signal: ctx.signal },
          ),
      );
      const media = result.images[0];
      if (media) return { media, providerKey: candidate.entry.provider.key, costUsd: result.usage.cost.usd };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new PipelineError('No image provider produced a result');
}

async function generateVideo(
  ctx: StepContext,
  req: {
    prompt: string;
    negativePrompt?: string;
    imageUrl: string;
    durationSec: number;
    aspectRatio: string;
    motion?: string;
    quality: 'draft' | 'standard' | 'premium';
  },
): Promise<{ media: GeneratedMedia; providerKey: string; costUsd: number }> {
  const chain = ctx.registry.chain({
    capability: 'generateVideo',
    estimate: { capability: 'generateVideo', seconds: req.durationSec, quality: req.quality },
  });
  let lastError: unknown;
  for (const candidate of chain) {
    const provider = candidate.entry.provider as unknown as VideoCapable;
    try {
      const result = await meter(
        { usage: ctx.repos.usage },
        {
          providerKey: candidate.entry.provider.key,
          operation: 'video',
          ctx: { channelId: ctx.channel.id, videoId: ctx.video.id, jobId: ctx.jobId },
          estimated: candidate.estimatedCost,
          registry: ctx.registry,
        },
        () => provider.generateVideo(req, { channelId: ctx.channel.id, videoId: ctx.video.id, jobId: ctx.jobId }),
      );
      return { media: result.video, providerKey: candidate.entry.provider.key, costUsd: result.usage.cost.usd };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new PipelineError('No video provider produced a result');
}
