import type { AppServices } from '../services/container.js';
import { defaultSourcesFor } from '../services/discovery.js';
import { RulesEngine } from '../services/rules.js';
import { hashPassword } from '../shared/crypto.js';
import type { ChannelRecord, ChannelSettingsRecord, UserRecord } from '../db/types.js';

/**
 * Content templates (spec §39). Each one is a complete production profile: how the script is
 * shaped, how it looks, how fast it cuts.
 */
export const SYSTEM_TEMPLATES = [
  {
    name: 'Documentary',
    description: 'Long-form, source-led narrative with a strong through-line.',
    scriptStructure: {
      structure: 'chronological narrative',
      beats: ['cold open on the most striking fact', 'context', 'central question', 'evidence in order', 'turn', 'consequences', 'reflection'],
    },
    visualStyle: 'cinematic documentary, muted colour grade, archival texture',
    musicMood: 'epic cinematic',
    sceneDurationSec: 9,
    thumbnailStyle: 'single dramatic subject, heavy contrast, two-word overlay',
  },
  {
    name: 'Top 10',
    description: 'Ranked countdown with an escalating payoff.',
    scriptStructure: {
      structure: 'countdown',
      beats: ['promise of the number one', 'items 10 to 2 with escalating stakes', 'number one', 'callback to the hook'],
    },
    visualStyle: 'bright, high-energy, bold graphics',
    musicMood: 'upbeat',
    sceneDurationSec: 5,
    thumbnailStyle: 'numbered badge, surprised subject, three-word overlay',
  },
  {
    name: 'Explainer',
    description: 'One idea taken apart carefully, from first principles.',
    scriptStructure: {
      structure: 'thesis and evidence',
      beats: ['the confusion', 'the simplest true model', 'building complexity', 'common mistake', 'what to do with it'],
    },
    visualStyle: 'clean diagrammatic, flat illustration, generous whitespace',
    musicMood: 'neutral cinematic',
    sceneDurationSec: 7,
    thumbnailStyle: 'diagram fragment plus a question in three words',
  },
  {
    name: 'Story',
    description: 'A single narrative arc following one person or event.',
    scriptStructure: {
      structure: 'story arc',
      beats: ['in medias res', 'who this is', 'the decision', 'the cost', 'the aftermath', 'what it means'],
    },
    visualStyle: 'warm cinematic, shallow depth of field, character-led',
    musicMood: 'emotional',
    sceneDurationSec: 8,
    thumbnailStyle: 'face in close-up, emotional expression, two-word overlay',
  },
  {
    name: 'News Analysis',
    description: 'Timely, tightly sourced take on something that just happened.',
    scriptStructure: {
      structure: 'question and answer',
      beats: ['what happened', 'why it matters', 'what the sources actually say', 'what is still unknown', 'what to watch'],
    },
    visualStyle: 'contemporary broadcast, cool grade, lower thirds',
    musicMood: 'tense',
    sceneDurationSec: 6,
    thumbnailStyle: 'split composition, headline fragment in three words',
  },
  {
    name: 'Educational',
    description: 'Structured teaching with worked examples.',
    scriptStructure: {
      structure: 'progressive lesson',
      beats: ['why this matters to you', 'concept one with example', 'concept two with example', 'putting it together', 'practice'],
    },
    visualStyle: 'clear instructional, annotated stills, high legibility',
    musicMood: 'neutral cinematic',
    sceneDurationSec: 8,
    thumbnailStyle: 'before/after split with a three-word promise',
  },
  {
    name: 'Case Study',
    description: 'One example examined in depth for what it generalises to.',
    scriptStructure: {
      structure: 'case study',
      beats: ['the outcome first', 'the starting position', 'what they did', 'what actually caused it', 'what transfers'],
    },
    visualStyle: 'documentary-realistic, data overlays, restrained grade',
    musicMood: 'neutral cinematic',
    sceneDurationSec: 8,
    thumbnailStyle: 'result number in large type with the subject behind',
  },
] as const;

/**
 * Royalty-free-by-construction beds. These are descriptors, not audio: the local provider
 * synthesises the track on demand, so the system owns every note it uses (spec §22).
 */
export const SYSTEM_MUSIC = [
  { title: 'Slow Horizon', mood: 'epic cinematic', durationSec: 3600, bpm: 72 },
  { title: 'Quiet Machinery', mood: 'neutral cinematic', durationSec: 3600, bpm: 84 },
  { title: 'Forward Motion', mood: 'upbeat', durationSec: 3600, bpm: 112 },
  { title: 'Held Breath', mood: 'tense', durationSec: 3600, bpm: 68 },
  { title: 'Long Light', mood: 'emotional', durationSec: 3600, bpm: 74 },
];

export interface SeedResult {
  prompts: { created: string[]; existing: string[] };
  templates: number;
  music: number;
}

/** Idempotent: safe to run on every deploy. */
export async function seedSystem(services: AppServices, ownerUserId?: string): Promise<SeedResult> {
  const prompts = await services.prompts.seedMissing();

  let templates = 0;
  if (ownerUserId) {
    const existing = await services.repos.contentTemplates.listByUser(ownerUserId);
    const byName = new Set(existing.map((t) => t.name));
    for (const template of SYSTEM_TEMPLATES) {
      if (byName.has(template.name)) continue;
      await services.repos.contentTemplates.create({
        userId: ownerUserId,
        name: template.name,
        description: template.description,
        scriptStructure: template.scriptStructure,
        visualStyle: template.visualStyle,
        voiceProfile: null,
        musicMood: template.musicMood,
        sceneDurationSec: template.sceneDurationSec,
        thumbnailStyle: template.thumbnailStyle,
        isSystem: true,
      });
      templates += 1;
    }
  }

  let music = 0;
  const existingMusic = await services.repos.music.list();
  const moods = new Set(existingMusic.map((m) => m.mood));
  for (const track of SYSTEM_MUSIC) {
    if (moods.has(track.mood)) continue;
    await services.repos.music.create({
      title: track.title,
      source: 'generated',
      license: 'owned',
      attribution: null,
      durationSec: track.durationSec,
      mood: track.mood,
      // Synthesised on demand by the local provider; no third-party file is involved.
      storageKey: `library/music/${track.mood.replace(/\s+/g, '-')}.m4a`,
      bpm: track.bpm,
    });
    music += 1;
  }

  return { prompts, templates, music };
}

export interface DemoChannelInput {
  email: string;
  password: string;
  channelName: string;
  niche: string;
  language?: string;
  targetAudience?: string;
  videosPerWeek?: number;
  targetDurationMin?: number;
  automationMode?: ChannelSettingsRecord['automationMode'];
  monthlyBudgetUsd?: number;
}

export interface DemoResult {
  user: UserRecord;
  channel: ChannelRecord;
  settings: ChannelSettingsRecord;
  created: boolean;
}

/** Creates (or returns) a user with one fully configured channel. */
export async function seedDemoChannel(services: AppServices, input: DemoChannelInput): Promise<DemoResult> {
  const email = input.email.toLowerCase();
  let user = await services.repos.users.findByEmail(email);
  let created = false;

  if (!user) {
    user = await services.repos.users.create({
      email,
      passwordHash: hashPassword(input.password),
      name: email.split('@')[0] ?? 'Owner',
      role: 'ADMIN',
    });
    created = true;
  }

  const channels = await services.repos.channels.listByUser(user.id);
  let channel = channels.find((c) => c.name === input.channelName);
  if (!channel) {
    channel = await services.repos.channels.create({
      userId: user.id,
      platform: 'YOUTUBE',
      youtubeChannelId: null,
      name: input.channelName,
      description: `${input.niche} channel`,
      thumbnailUrl: null,
      subscriberCount: null,
      videoCount: null,
      viewCount: null,
      statsFetchedAt: null,
      enabled: true,
      isDefault: channels.length === 0,
    });
  }

  const settings = await services.repos.channelSettings.upsert(channel.id, {
    niche: input.niche,
    language: input.language ?? 'en',
    targetAudience: input.targetAudience ?? `people curious about ${input.niche}`,
    contentStyle: 'documentary',
    targetDurationMin: input.targetDurationMin ?? 10,
    videosPerWeek: input.videosPerWeek ?? 3,
    automationMode: input.automationMode ?? 'SEMI_AUTO',
    autopilotEnabled: false,
    autopilotRunAt: '06:00',
    timezone: 'UTC',
    defaultPublishTime: '18:00',
    publishDays: [1, 3, 5],
    privacyStatus: 'private',
    voiceProviderId: null,
    voiceId: null,
    voiceSettings: null,
    visualStyle: 'cinematic documentary, muted colour grade',
    thumbnailStyle: 'high-contrast subject with a three-word overlay',
    musicMood: 'neutral cinematic',
    monthlyBudgetUsd: input.monthlyBudgetUsd ?? services.config.limits.defaultMonthlyBudgetUsd,
    minIdeaScore: 60,
    minQcScore: 75,
    minFactConfidence: 0.5,
    minRetentionScore: 65,
    maxCostPerVideoUsd: 15,
    ideaWeights: null,
    bufferTargetVideos: 2,
  });

  const sources = await services.repos.discovery.listSources(channel.id);
  if (sources.length === 0) {
    for (const source of defaultSourcesFor(channel.id, settings.niche, settings.language)) {
      await services.repos.discovery.createSource(source);
    }
  }

  const rules = await services.repos.rules.listByChannel(channel.id);
  if (rules.length === 0) {
    for (const rule of RulesEngine.defaultsFor(settings)) {
      await services.repos.rules.create(rule);
    }
  }

  await seedSystem(services, user.id);

  return { user, channel, settings, created };
}
