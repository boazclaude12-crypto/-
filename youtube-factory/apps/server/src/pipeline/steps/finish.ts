import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PipelineStep, StepContext, StepResult } from '../context.js';
import { buildTimeline, timelineSchema, type Timeline } from '../../media/timeline.js';
import { synthesizeSfx, sfxDuration, type SfxKind } from '../../media/sfx.js';
import { buildChapters, locateBlocks } from '../../media/captions.js';
import { runTechnicalChecks, checkOriginality } from '../../services/quality.js';
import { StorageKeys } from '../../storage/index.js';
import { PipelineError, errorMessage } from '../../shared/errors.js';
import { scoreQuality } from '../../shared/scoring.js';
import type { ImageCapable, MusicCapable } from '../../providers/types.js';
import { meter } from '../../providers/registry.js';

/** EDITING → QC. Builds the timeline and renders the master file (spec §24, §25, §68). */
export const editStep: PipelineStep = {
  name: 'edit',
  from: 'EDITING',
  running: 'EDITING',

  async execute(ctx: StepContext): Promise<StepResult> {
    const [scenes, voiceovers] = await Promise.all([
      ctx.repos.scenes.listByVideo(ctx.video.id),
      ctx.repos.voiceovers.listByVideo(ctx.video.id),
    ]);
    if (scenes.length === 0) throw new PipelineError('No scenes to edit');
    if (voiceovers.length === 0) throw new PipelineError('No narration to edit against');

    const assetsDir = join(ctx.workDir, 'assets');
    await mkdir(assetsDir, { recursive: true });

    // Materialise every asset locally — FFmpeg needs files, not object-store keys.
    const sceneInputs = [];
    for (const scene of scenes) {
      if (!scene.assetId) throw new PipelineError(`Scene ${scene.index} has no asset`);
      const asset = await ctx.repos.assets.findById(scene.assetId);
      if (!asset) throw new PipelineError(`Scene ${scene.index} references a missing asset`);
      const path = await ctx.storage.localPath(asset.storageKey, assetsDir);
      sceneInputs.push({
        index: scene.index,
        durationSec: scene.durationSec,
        path,
        kind: asset.kind === 'VIDEO' ? ('video' as const) : ('image' as const),
        textOverlay: scene.textOverlay,
      });
    }

    const voiceInputs = [];
    for (const clip of voiceovers) {
      voiceInputs.push({
        index: clip.index,
        path: await ctx.storage.localPath(clip.storageKey, assetsDir),
        durationSec: clip.durationSec,
      });
    }

    await ctx.reportProgress(20);

    const narrationDuration = voiceovers.reduce((sum, v) => sum + v.durationSec, 0);
    const sceneDuration = scenes.reduce((sum, s) => sum + s.durationSec, 0);
    const totalDuration = Math.max(narrationDuration, sceneDuration);

    // Edit decisions. If the agent is unavailable the render still proceeds with plain cuts
    // — a video with no cross-fades is fine; no video at all is not.
    let edit;
    try {
      let voiceCursor = 0;
      let sceneCursor = 0;
      const result = await ctx.agents.editing.run(
        {
          style: ctx.settings.contentStyle,
          totalDurationSec: totalDuration,
          musicMood: ctx.settings.musicMood,
          scenes: scenes.map((s) => {
            const startSec = sceneCursor;
            sceneCursor += s.durationSec;
            return {
              index: s.index,
              startSec,
              durationSec: s.durationSec,
              visualBrief: s.visualBrief,
              textOverlay: s.textOverlay ?? undefined,
              sfx: s.sfx ?? undefined,
              importance: s.importance,
            };
          }),
          voiceSegments: voiceovers.map((v) => {
            const startSec = voiceCursor;
            voiceCursor += v.durationSec;
            return { index: v.index, startSec, durationSec: v.durationSec, text: v.text.slice(0, 200) };
          }),
        },
        { channelId: ctx.channel.id, videoId: ctx.video.id, jobId: ctx.jobId, signal: ctx.signal },
      );
      edit = result.output;
    } catch (err) {
      ctx.logger.warn('editing agent unavailable, rendering with straight cuts', {
        videoId: ctx.video.id,
        error: errorMessage(err),
      });
      edit = {
        transitions: [],
        overlays: [],
        sfx: [],
        music: { mood: ctx.settings.musicMood, gainDb: -22, duckToDb: -30, fadeInSec: 2, fadeOutSec: 3 },
        notes: 'Rendered with straight cuts — the editing agent was unavailable.',
      };
    }

    await ctx.reportProgress(35);

    // ── music ───────────────────────────────────────────────────────────────
    let music: Parameters<typeof buildTimeline>[0]['music'];
    try {
      const licensed = await ctx.repos.music.findByMood(edit.music.mood, totalDuration);
      // Library tracks are declared by the seed and materialised on first use, so a fresh
      // install has a working music library without shipping audio files in the repo.
      if (licensed && !(await ctx.storage.exists(licensed.storageKey))) {
        const bed = await generateMusic(ctx, licensed.mood, Math.max(totalDuration, 60));
        if (bed) await ctx.storage.put(licensed.storageKey, bed.bytes, 'audio/mp4');
      }

      if (licensed && (await ctx.storage.exists(licensed.storageKey))) {
        music = {
          path: await ctx.storage.localPath(licensed.storageKey, assetsDir),
          gainDb: edit.music.gainDb,
          duckToDb: edit.music.duckToDb,
          fadeInSec: edit.music.fadeInSec,
          fadeOutSec: edit.music.fadeOutSec,
          license: licensed.license,
          attribution: licensed.attribution ?? undefined,
        };
      } else {
        const generated = await generateMusic(ctx, edit.music.mood, totalDuration);
        if (generated) {
          const key = StorageKeys.music(ctx.channel.id, ctx.video.id, 'm4a');
          await ctx.storage.put(key, generated.bytes, 'audio/mp4');
          const path = join(assetsDir, 'music.m4a');
          await writeFile(path, generated.bytes);
          await ctx.repos.assets.create({
            videoId: ctx.video.id,
            kind: 'MUSIC',
            storageKey: key,
            mimeType: 'audio/mp4',
            bytes: generated.bytes.length,
            durationSec: totalDuration,
            width: null,
            height: null,
            provider: generated.providerKey,
            externalId: null,
            costUsd: generated.costUsd,
            license: generated.license,
            attribution: generated.attribution ?? null,
            checksum: null,
            metadata: { mood: edit.music.mood },
          });
          music = {
            path,
            gainDb: edit.music.gainDb,
            duckToDb: edit.music.duckToDb,
            fadeInSec: edit.music.fadeInSec,
            fadeOutSec: edit.music.fadeOutSec,
            license: generated.license,
            attribution: generated.attribution,
          };
        }
      }
    } catch (err) {
      ctx.logger.warn('music unavailable, rendering without a bed', {
        videoId: ctx.video.id,
        error: errorMessage(err),
      });
    }

    // ── sound effects ───────────────────────────────────────────────────────
    const sfxDir = join(ctx.workDir, 'sfx');
    await mkdir(sfxDir, { recursive: true });
    const sfxCache = new Map<SfxKind, string>();
    const sfxClips = [];
    for (const cue of edit.sfx) {
      let path = sfxCache.get(cue.kind);
      if (!path) {
        const synthesized = await synthesizeSfx(ctx.renderer.tools, cue.kind, sfxDir);
        path = synthesized.path;
        sfxCache.set(cue.kind, path);
      }
      sfxClips.push({ path, atSec: cue.atSec, durationSec: sfxDuration(cue.kind), gainDb: cue.gainDb });
    }

    await ctx.reportProgress(45);

    // ── captions ────────────────────────────────────────────────────────────
    const captionAsset = (await ctx.repos.assets.listByVideo(ctx.video.id, 'CAPTION'))[0];
    const srtPath = captionAsset ? await ctx.storage.localPath(captionAsset.storageKey, assetsDir) : undefined;

    const timeline = buildTimeline({
      width: ctx.config.media.width,
      height: ctx.config.media.height,
      fps: ctx.config.media.fps,
      scenes: sceneInputs,
      voiceover: voiceInputs,
      music,
      sfx: sfxClips,
      transitions: edit.transitions,
      overlays: edit.overlays,
      captions: srtPath ? { srtPath, burnIn: false } : undefined,
    });

    const outputPath = join(ctx.workDir, 'final.mp4');
    const rendered = await ctx.renderer.render(timeline, {
      outputPath,
      signal: ctx.signal,
      onProgress: (percent) => {
        void ctx.reportProgress(45 + Math.round(percent * 0.5));
      },
    });

    await ctx.repos.timelines.upsert(ctx.video.id, timeline, rendered.commandLine);

    const renderKey = StorageKeys.render(ctx.channel.id, ctx.video.id);
    const stored = await ctx.storage.putFile(renderKey, outputPath, 'video/mp4');
    await ctx.repos.assets.create({
      videoId: ctx.video.id,
      kind: 'RENDER',
      storageKey: renderKey,
      mimeType: 'video/mp4',
      bytes: stored.bytes,
      durationSec: rendered.info.durationSec,
      width: rendered.info.width ?? null,
      height: rendered.info.height ?? null,
      provider: 'ffmpeg',
      externalId: null,
      costUsd: 0,
      license: 'owned',
      attribution: music?.attribution ?? null,
      checksum: stored.checksum,
      metadata: { filterGraph: rendered.filterGraph.slice(0, 4000) },
    });

    await ctx.reportProgress(100);
    return {
      status: 'QC',
      patch: {
        renderKey,
        actualDurationSec: rendered.info.durationSec,
        renderWidth: rendered.info.width ?? null,
        renderHeight: rendered.info.height ?? null,
        fileSizeBytes: stored.bytes,
      },
      note: `Rendered ${rendered.info.durationSec.toFixed(0)}s at ${rendered.info.width}x${rendered.info.height}`,
    };
  },
};

/** QC → THUMBNAIL. The publish gate (spec §26, §32). */
export const qcStep: PipelineStep = {
  name: 'qc',
  from: 'QC',
  running: 'QC',
  essential: true,

  async execute(ctx: StepContext): Promise<StepResult> {
    if (!ctx.video.renderKey) throw new PipelineError('Nothing rendered to quality-check');

    const [scenes, assets, script, research, timelineRecord, thumbnails, seo] = await Promise.all([
      ctx.repos.scenes.listByVideo(ctx.video.id),
      ctx.repos.assets.listByVideo(ctx.video.id),
      ctx.repos.scripts.findByVideo(ctx.video.id),
      ctx.repos.research.findByVideo(ctx.video.id),
      ctx.repos.timelines.findByVideo(ctx.video.id),
      ctx.repos.thumbnails.listByVideo(ctx.video.id),
      ctx.repos.seo.findByVideo(ctx.video.id),
    ]);
    if (!timelineRecord) throw new PipelineError('No timeline recorded for this render');

    const timeline = timelineSchema.parse(timelineRecord.document) as Timeline;
    const localRender = await ctx.storage.localPath(ctx.video.renderKey, join(ctx.workDir, 'qc'));

    await ctx.reportProgress(25);

    const visualAssets = assets.filter((a) => a.kind === 'IMAGE' || a.kind === 'VIDEO');
    const technical = await runTechnicalChecks(ctx.renderer.tools, {
      stage: 'render',
      renderPath: localRender,
      timeline,
      expectedDurationSec: timeline.durationSec,
      thumbnailPresent: thumbnails.some((t) => t.selected && t.storageKey),
      titlePresent: Boolean(seo?.title ?? ctx.video.title),
      descriptionPresent: Boolean(seo?.description),
      captionsPresent: assets.some((a) => a.kind === 'CAPTION'),
      sceneCount: scenes.length,
      assetCount: visualAssets.length,
      licences: assets.map((a) => a.license ?? 'owned'),
    });

    await ctx.reportProgress(60);

    const narration = script
      ? [script.hook, script.intro, ...script.sections.map((s) => s.narration), script.cta].join(' ')
      : '';
    const originality = checkOriginality(narration, research?.sources ?? []);

    const scores = {
      research: Math.round((research?.confidence ?? 0) * 100),
      script: script?.retentionScore ?? 0,
      hook: script?.retentionScore ?? 0,
      retention: ctx.video.retentionScore ?? script?.retentionScore ?? 0,
      visual: technical.checks.find((c) => c.name === 'no_black_frames')?.passed ? 85 : 40,
      audio: technical.checks.find((c) => c.name === 'loudness')?.passed ? 92 : 60,
      thumbnail: thumbnails.find((t) => t.selected)?.ctrPotential ?? 0,
      seo: seo ? 85 : 0,
      originality: originality.score,
    };
    const quality = scoreQuality(scores);

    // The technical checks are the ground truth; the agent's job is judgement on top of
    // them. If it is unavailable, the mechanical verdict stands on its own.
    let verdict = {
      passed: technical.passed,
      score: technical.score,
      checks: technical.checks,
      repairs: [] as string[],
    };
    try {
      const agentVerdict = await ctx.agents.qc.run(
        {
          probe: technical.probe,
          technicalChecks: technical.checks,
          scores,
          thresholds: {
            minQcScore: ctx.settings.minQcScore,
            minFactConfidence: ctx.settings.minFactConfidence * 100,
            minRetentionScore: ctx.settings.minRetentionScore,
          },
        },
        { channelId: ctx.channel.id, videoId: ctx.video.id, jobId: ctx.jobId, signal: ctx.signal },
      );
      verdict = {
        passed: agentVerdict.output.passed && technical.passed,
        score: Math.round((agentVerdict.output.score + technical.score) / 2),
        checks: agentVerdict.output.checks,
        repairs: agentVerdict.output.repairs,
      };
    } catch (err) {
      ctx.logger.warn('qc agent unavailable, using the technical verdict alone', {
        videoId: ctx.video.id,
        error: errorMessage(err),
      });
    }

    if (!originality.passed) {
      verdict.passed = false;
      verdict.checks = [
        ...verdict.checks,
        {
          name: 'originality',
          passed: false,
          severity: 'blocker' as const,
          detail: `The script overlaps too closely with "${originality.worst?.source}" (${((originality.worst?.overlap ?? 0) * 100).toFixed(
            0,
          )}% shared phrasing). Rewrite in original wording.`,
        },
      ];
      verdict.repairs = [...verdict.repairs, 'Rewrite the overlapping passages in original wording.'];
    }

    await ctx.repos.qc.create({
      videoId: ctx.video.id,
      passed: verdict.passed,
      score: verdict.score,
      checks: verdict.checks,
      failures: verdict.checks.filter((c) => !c.passed),
      repairs: verdict.repairs,
    });

    await ctx.reportProgress(100);

    if (!verdict.passed) {
      const attempts = (await ctx.repos.qc.listByVideo(ctx.video.id)).length;
      const target = repairTarget(verdict.checks.filter((c) => !c.passed).map((c) => c.name));

      if (attempts < 3 && target) {
        ctx.logger.warn('qc failed, sending the video back for repair', {
          videoId: ctx.video.id,
          attempt: attempts,
          target,
        });
        return {
          status: target,
          patch: { qualityScore: quality.overall, qualityBreakdown: quality.parts },
          note: `QC failed (${verdict.score}/100) — repairing from ${target}`,
        };
      }

      await notifyOwner(ctx, 'QC_FAILED', `QC failed for "${ctx.video.title}"`, {
        score: verdict.score,
        failures: verdict.checks.filter((c) => !c.passed).map((c) => c.name),
      });
      return {
        status: 'FAILED',
        enqueueNext: false,
        patch: {
          qualityScore: quality.overall,
          qualityBreakdown: quality.parts,
          failureReason: `Quality control failed after ${attempts} attempts: ${verdict.checks
            .filter((c) => !c.passed)
            .map((c) => c.name)
            .join(', ')}`,
        },
        note: 'QC failed after repeated repair attempts',
      };
    }

    return {
      status: 'THUMBNAIL',
      patch: { qualityScore: quality.overall, qualityBreakdown: quality.parts },
      note: `QC passed with ${verdict.score}/100 (quality ${quality.overall}/100)`,
    };
  },
};

/** THUMBNAIL → SEO. Generates variants and picks one (spec §27). */
export const thumbnailStep: PipelineStep = {
  name: 'thumbnail',
  from: 'THUMBNAIL',
  running: 'THUMBNAIL',

  async execute(ctx: StepContext): Promise<StepResult> {
    const script = await ctx.repos.scripts.findByVideo(ctx.video.id);
    const idea = ctx.video.ideaId ? await ctx.repos.ideas.findById(ctx.video.ideaId) : null;

    const concepts = await ctx.agents.thumbnail.run(
      {
        title: ctx.video.title,
        topic: idea?.topic ?? ctx.video.title,
        hook: script?.hook?.slice(0, 300) ?? '',
        audience: ctx.settings.targetAudience,
        thumbnailStyle: ctx.settings.thumbnailStyle,
      },
      { channelId: ctx.channel.id, videoId: ctx.video.id, jobId: ctx.jobId, signal: ctx.signal },
    );

    const dir = join(ctx.workDir, 'thumbnails');
    await mkdir(dir, { recursive: true });

    const records = [];
    for (const [i, concept] of concepts.output.concepts.entries()) {
      let storageKey: string | null = null;
      let costUsd = 0;
      let provider: string | null = null;
      try {
        const image = await generateThumbnailImage(ctx, concept.prompt);
        const background = join(dir, `bg-${concept.variant}.png`);
        await writeFile(background, image.bytes);
        const composed = join(dir, `thumb-${concept.variant}.jpg`);
        await ctx.renderer.renderThumbnail(background, concept.overlayText, composed);

        const key = StorageKeys.thumbnail(ctx.channel.id, ctx.video.id, concept.variant);
        await ctx.storage.put(key, await readFile(composed), 'image/jpeg');
        storageKey = key;
        costUsd = image.costUsd;
        provider = image.providerKey;
      } catch (err) {
        // A missing thumbnail image is caught by QC; losing the whole step is worse.
        ctx.logger.warn('thumbnail variant failed', {
          videoId: ctx.video.id,
          variant: concept.variant,
          error: errorMessage(err),
        });
      }

      records.push({
        variant: concept.variant,
        concept: concept.concept,
        prompt: concept.prompt,
        storageKey,
        ctrPotential: concept.ctrPotential,
        selected: false,
        provider,
        costUsd,
      });
      await ctx.reportProgress(Math.round(((i + 1) / concepts.output.concepts.length) * 90));
    }

    await ctx.repos.thumbnails.replaceAll(ctx.video.id, records);

    // Auto mode takes the highest predicted CTR; the user can override on the video page.
    const usable = records.filter((r) => r.storageKey);
    const best = [...usable].sort((a, b) => b.ctrPotential - a.ctrPotential)[0];
    if (!best) {
      throw new PipelineError('No thumbnail variant could be produced');
    }
    await ctx.repos.thumbnails.select(ctx.video.id, best.variant);

    await ctx.reportProgress(100);
    return {
      status: 'SEO',
      note: `${usable.length} thumbnails, variant ${best.variant} selected (predicted CTR ${best.ctrPotential})`,
    };
  },
};

/** SEO → READY. Titles, description, tags and chapters (spec §28-§30). */
export const seoStep: PipelineStep = {
  name: 'seo',
  from: 'SEO',
  running: 'SEO',

  async execute(ctx: StepContext): Promise<StepResult> {
    const [script, research, voiceovers] = await Promise.all([
      ctx.repos.scripts.findByVideo(ctx.video.id),
      ctx.repos.research.findByVideo(ctx.video.id),
      ctx.repos.voiceovers.listByVideo(ctx.video.id),
    ]);
    if (!script) throw new PipelineError('No script to derive metadata from');

    // Chapters come from where each section actually starts in the narration, measured from
    // the TTS word timings rather than guessed (spec §30).
    const narrationBlocks = [
      { title: 'Introduction', text: `${script.hook} ${script.intro}` },
      ...script.sections.map((s) => ({ title: s.heading, text: s.narration })),
      { title: 'Closing', text: script.cta },
    ];
    const totalAudio = voiceovers.reduce((sum, v) => sum + v.durationSec, 0) || script.estimatedDuration;
    const allWords = voiceovers.flatMap((v) => v.wordTimings ?? []);
    const sectionStarts = allWords.length
      ? locateBlocks(narrationBlocks, allWords)
      : proportionalBlocks(narrationBlocks, totalAudio);
    const chapters = buildChapters(sectionStarts, ctx.video.actualDurationSec ?? totalAudio);

    await ctx.reportProgress(30);

    const narration = [script.hook, script.intro, ...script.sections.map((s) => s.narration), script.cta].join('\n\n');
    const result = await ctx.agents.seo.run(
      {
        title: ctx.video.title,
        topic: research?.topic ?? ctx.video.title,
        script: narration.slice(0, 24_000),
        language: ctx.settings.language,
        research: (research?.sources ?? []).slice(0, 25).map((s) => ({
          claim: s.claim,
          source: s.source,
          sourceUrl: s.sourceUrl ?? undefined,
        })),
        chapters,
      },
      { channelId: ctx.channel.id, videoId: ctx.video.id, jobId: ctx.jobId, signal: ctx.signal },
    );

    const best = result.output.titles[0];
    await ctx.repos.seo.upsert(ctx.video.id, {
      title: best?.text ?? ctx.video.title,
      titleCandidates: result.output.titles,
      description: result.output.description,
      tags: result.output.tags,
      hashtags: result.output.hashtags,
      keywords: result.output.keywords,
      chapters,
      categoryId: '27',
    });

    // QC ran before the thumbnail and SEO stages existed, so its quality score was missing
    // two dimensions. Now that every contributor is in place, recompute it (spec §52).
    const [thumbnails, qc] = await Promise.all([
      ctx.repos.thumbnails.listByVideo(ctx.video.id),
      ctx.repos.qc.latest(ctx.video.id),
    ]);
    const previous = (ctx.video.qualityBreakdown ?? {}) as Record<string, number>;
    const quality = scoreQuality({
      research: previous.research,
      script: previous.script,
      hook: previous.hook,
      retention: previous.retention,
      visual: previous.visual,
      audio: previous.audio,
      originality: previous.originality,
      thumbnail: thumbnails.find((t) => t.selected)?.ctrPotential ?? 0,
      seo: best ? best.score : 0,
    });

    await ctx.reportProgress(100);
    return {
      status: 'READY',
      patch: {
        title: best?.text ?? ctx.video.title,
        qualityScore: quality.overall,
        qualityBreakdown: quality.parts,
      },
      note: `${result.output.titles.length} title candidates, ${result.output.tags.length} tags, ${chapters.length} chapters; quality ${quality.overall}/100 (QC ${qc?.score ?? '—'})`,
    };
  },
};

/** Fallback when a TTS provider returned no word alignment at all. */
function proportionalBlocks(
  blocks: Array<{ title: string; text: string }>,
  totalSec: number,
): Array<{ title: string; startSec: number }> {
  const totalChars = blocks.reduce((n, b) => n + b.text.length, 0) || 1;
  let cursor = 0;
  return blocks.map((block) => {
    const start = cursor;
    cursor += (block.text.length / totalChars) * totalSec;
    return { title: block.title, startSec: start };
  });
}

function repairTarget(failures: string[]): 'EDITING' | 'GENERATING_VISUALS' | 'GENERATING_VOICE' | null {
  if (failures.some((f) => f.includes('black') || f.includes('scenes_have_assets') || f.includes('duplicate'))) {
    return 'GENERATING_VISUALS';
  }
  if (failures.some((f) => f.includes('audio') || f.includes('dead_air') || f.includes('loudness'))) {
    return 'GENERATING_VOICE';
  }
  if (failures.some((f) => f.includes('duration') || f.includes('render') || f.includes('resolution'))) {
    return 'EDITING';
  }
  return null;
}

async function generateThumbnailImage(
  ctx: StepContext,
  prompt: string,
): Promise<{ bytes: Buffer; providerKey: string; costUsd: number }> {
  const chain = ctx.registry.chain({
    capability: 'generateImage',
    estimate: { capability: 'generateImage', images: 1, quality: 'standard' },
  });
  let lastError: unknown;
  for (const candidate of chain) {
    const provider = candidate.entry.provider as unknown as ImageCapable;
    try {
      const result = await meter(
        { usage: ctx.repos.usage },
        {
          providerKey: candidate.entry.provider.key,
          operation: 'thumbnail',
          ctx: { channelId: ctx.channel.id, videoId: ctx.video.id, jobId: ctx.jobId },
          estimated: candidate.estimatedCost,
          registry: ctx.registry,
        },
        () =>
          provider.generateImage(
            { prompt, width: 1280, height: 720, count: 1, style: ctx.settings.thumbnailStyle, quality: 'standard' },
            { channelId: ctx.channel.id, videoId: ctx.video.id },
          ),
      );
      const bytes = result.images[0]?.bytes;
      if (bytes) return { bytes, providerKey: candidate.entry.provider.key, costUsd: result.usage.cost.usd };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new PipelineError('No image provider produced a thumbnail');
}

async function generateMusic(
  ctx: StepContext,
  mood: string,
  durationSec: number,
): Promise<{ bytes: Buffer; providerKey: string; costUsd: number; license: string; attribution?: string } | null> {
  const chain = ctx.registry.chain({
    capability: 'generateMusic',
    estimate: { capability: 'generateMusic', seconds: durationSec },
  });
  for (const candidate of chain) {
    const provider = candidate.entry.provider as unknown as MusicCapable;
    try {
      const result = await meter(
        { usage: ctx.repos.usage },
        {
          providerKey: candidate.entry.provider.key,
          operation: 'music',
          ctx: { channelId: ctx.channel.id, videoId: ctx.video.id, jobId: ctx.jobId },
          estimated: candidate.estimatedCost,
          registry: ctx.registry,
        },
        () => provider.generateMusic({ mood, durationSec }, { channelId: ctx.channel.id, videoId: ctx.video.id }),
      );
      if (result.audio.bytes) {
        return {
          bytes: result.audio.bytes,
          providerKey: candidate.entry.provider.key,
          costUsd: result.usage.cost.usd,
          license: result.license,
          attribution: result.attribution,
        };
      }
    } catch {
      /* try the next provider */
    }
  }
  return null;
}

async function notifyOwner(
  ctx: StepContext,
  event: 'QC_FAILED',
  title: string,
  meta: Record<string, unknown>,
): Promise<void> {
  const channel = await ctx.repos.channels.findById(ctx.channel.id);
  if (!channel) return;
  await ctx.notifier.notify(channel.userId, {
    event,
    title,
    body: `Video "${ctx.video.title}" did not pass quality control.`,
    url: `${ctx.config.http.appUrl}/videos/${ctx.video.id}`,
    meta,
  });
}
