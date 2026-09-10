import { z } from 'zod';
import {
  AGENT_NAMES,
  CLAIM_VERDICTS,
  SCENE_STRATEGIES,
  SOURCE_KINDS,
} from './types.js';

/**
 * Structured contracts between agents (spec §77). Nothing is passed between stages as free
 * text: every hand-off is one of these schemas, validated on both sides.
 */

const score100 = z.number().min(0).max(100);
const unit = z.number().min(0).max(1);

// ── Discovery ────────────────────────────────────────────────────────────────

export const trendSignalSchema = z.object({
  kind: z.enum(SOURCE_KINDS),
  topic: z.string().min(2).max(300),
  url: z.string().url().optional(),
  score: score100.default(0),
  velocity: z.number().optional(),
  observedAt: z.coerce.date().optional(),
  raw: z.record(z.unknown()).optional(),
});
export type TrendSignal = z.infer<typeof trendSignalSchema>;

// ── Ideas (spec §10) ─────────────────────────────────────────────────────────

export const ideaScoresSchema = z.object({
  estimatedDemand: score100,
  competition: score100,
  novelty: score100,
  evergreenScore: score100,
  trendScore: score100,
  estimatedCtr: score100,
  estimatedRetention: score100,
});
export type IdeaScores = z.infer<typeof ideaScoresSchema>;

export const contentIdeaSchema = ideaScoresSchema.extend({
  title: z.string().min(5).max(120),
  topic: z.string().min(3).max(200),
  angle: z.string().min(5).max(400),
  hook: z.string().min(5).max(400),
  targetAudience: z.string().min(3).max(200),
  rationale: z.string().max(1200).optional(),
  productionCostUsd: z.number().min(0).default(0),
  suggestedDurationMin: z.number().min(1).max(120).optional(),
});
export type ContentIdeaDraft = z.infer<typeof contentIdeaSchema>;

export const ideaAgentInputSchema = z.object({
  niche: z.string(),
  language: z.string(),
  targetAudience: z.string(),
  contentStyle: z.string(),
  count: z.number().int().min(1).max(25).default(5),
  trends: z.array(trendSignalSchema).default([]),
  competitorTopics: z.array(z.string()).default([]),
  recentTitles: z.array(z.string()).default([]),
  learnings: z.array(z.string()).default([]),
  avoidTopics: z.array(z.string()).default([]),
});
export type IdeaAgentInput = z.infer<typeof ideaAgentInputSchema>;

export const ideaAgentOutputSchema = z.object({
  ideas: z.array(contentIdeaSchema).min(1),
});
export type IdeaAgentOutput = z.infer<typeof ideaAgentOutputSchema>;

// ── Competitors (spec §9) ────────────────────────────────────────────────────

export const competitorAgentInputSchema = z.object({
  niche: z.string(),
  channels: z
    .array(
      z.object({
        name: z.string(),
        subscriberCount: z.number().optional(),
        recentVideos: z.array(
          z.object({
            title: z.string(),
            views: z.number().optional(),
            durationSec: z.number().optional(),
            publishedAt: z.string().optional(),
          }),
        ),
      }),
    )
    .min(1),
});
export type CompetitorAgentInput = z.infer<typeof competitorAgentInputSchema>;

export const competitorAgentOutputSchema = z.object({
  workingTopics: z.array(
    z.object({ topic: z.string(), evidence: z.string(), strength: score100 }),
  ),
  formatPatterns: z.array(z.string()),
  titlePatterns: z.array(z.string()),
  contentGaps: z.array(z.string()),
  recommendedDurationSec: z.number().min(60).max(7200).optional(),
  cadencePerWeek: z.number().min(0).max(50).optional(),
});
export type CompetitorAgentOutput = z.infer<typeof competitorAgentOutputSchema>;

// ── Research (spec §12) ──────────────────────────────────────────────────────

export const researchFindingSchema = z.object({
  claim: z.string().min(5).max(600),
  source: z.string().min(1).max(200),
  sourceUrl: z.string().max(500).optional(),
  sourceType: z.enum(['article', 'paper', 'book', 'video', 'dataset', 'encyclopedia', 'official', 'other']),
  date: z.string().max(40).optional(),
  confidence: unit,
  verdict: z.enum(CLAIM_VERDICTS).default('UNVERIFIED'),
});
export type ResearchFinding = z.infer<typeof researchFindingSchema>;

export const researchAgentInputSchema = z.object({
  topic: z.string(),
  angle: z.string(),
  language: z.string(),
  depth: z.enum(['light', 'standard', 'deep']).default('standard'),
  targetDurationMin: z.number().min(1).max(120),
  knownSources: z.array(z.string()).default([]),
});
export type ResearchAgentInput = z.infer<typeof researchAgentInputSchema>;

export const researchAgentOutputSchema = z.object({
  summary: z.string().min(20),
  findings: z.array(researchFindingSchema).min(1),
  openQuestions: z.array(z.string()).default([]),
});
export type ResearchAgentOutput = z.infer<typeof researchAgentOutputSchema>;

// ── Script (spec §13, §15) ───────────────────────────────────────────────────

export const scriptSectionSchema = z.object({
  heading: z.string().min(2).max(160),
  narration: z.string().min(10),
  purpose: z.string().max(200).optional(),
  targetSeconds: z.number().min(1).max(1800),
  patternInterrupt: z.string().max(300).optional(),
});
export type ScriptSection = z.infer<typeof scriptSectionSchema>;

export const scriptSchema = z.object({
  title: z.string().min(3).max(160),
  structure: z.string().min(3).max(80),
  hook: z.string().min(10),
  intro: z.string().min(10),
  sections: z.array(scriptSectionSchema).min(1),
  cta: z.string().min(5),
  estimatedDurationSec: z.number().min(30),
});
export type ScriptDraft = z.infer<typeof scriptSchema>;

export const scriptAgentInputSchema = z.object({
  topic: z.string(),
  angle: z.string(),
  hook: z.string(),
  audience: z.string(),
  style: z.string(),
  language: z.string(),
  targetDurationSec: z.number().min(60).max(7200),
  wordsPerMinute: z.number().min(60).max(220),
  research: z.array(researchFindingSchema),
  unverifiedClaims: z.array(z.string()).default([]),
  structureHint: z.string().optional(),
  rewriteInstructions: z.array(z.string()).default([]),
  previousScript: scriptSchema.optional(),
});
export type ScriptAgentInput = z.infer<typeof scriptAgentInputSchema>;

// ── Retention (spec §14) ─────────────────────────────────────────────────────

export const retentionAgentOutputSchema = z.object({
  retentionScore: score100,
  hookStrength: score100,
  checks: z.array(
    z.object({
      name: z.string(),
      passed: z.boolean(),
      detail: z.string().max(500),
    }),
  ),
  rewriteInstructions: z.array(z.string()).default([]),
});
export type RetentionAgentOutput = z.infer<typeof retentionAgentOutputSchema>;

// ── Fact check (spec §54) ────────────────────────────────────────────────────

export const factCheckAgentOutputSchema = z.object({
  overallConfidence: unit,
  claims: z.array(
    z.object({
      claim: z.string(),
      verdict: z.enum(CLAIM_VERDICTS),
      confidence: unit,
      sourceUrl: z.string().optional(),
      note: z.string().max(500).optional(),
    }),
  ),
  /** Sentences the script must drop or soften because nothing supports them. */
  removals: z.array(z.string()).default([]),
});
export type FactCheckAgentOutput = z.infer<typeof factCheckAgentOutputSchema>;

// ── Scenes (spec §16, §4) ────────────────────────────────────────────────────

export const sceneSchema = z.object({
  index: z.number().int().min(0),
  durationSec: z.number().min(1).max(60),
  narration: z.string(),
  visualBrief: z.string().min(5),
  prompt: z.string().min(5),
  negativePrompt: z.string().optional(),
  camera: z.string().optional(),
  style: z.string().optional(),
  aspectRatio: z.string().default('16:9'),
  characters: z.array(z.string()).default([]),
  location: z.string().optional(),
  lighting: z.string().optional(),
  motion: z.string().optional(),
  continuityNotes: z.string().optional(),
  textOverlay: z.string().optional(),
  sfx: z.string().optional(),
  importance: unit.default(0.5),
});
export type SceneDraft = z.infer<typeof sceneSchema>;

export const sceneAgentOutputSchema = z.object({
  scenes: z.array(sceneSchema).min(1),
  characterBible: z
    .array(
      z.object({
        name: z.string(),
        age: z.string().optional(),
        gender: z.string().optional(),
        clothing: z.string().optional(),
        hair: z.string().optional(),
        face: z.string().optional(),
        bodyType: z.string().optional(),
        style: z.string().optional(),
      }),
    )
    .default([]),
});
export type SceneAgentOutput = z.infer<typeof sceneAgentOutputSchema>;

export const visualAgentOutputSchema = z.object({
  strategy: z.enum(SCENE_STRATEGIES),
  prompt: z.string(),
  negativePrompt: z.string().optional(),
  motion: z.string().optional(),
  reason: z.string(),
});
export type VisualAgentOutput = z.infer<typeof visualAgentOutputSchema>;

// ── Thumbnails (spec §27) ────────────────────────────────────────────────────

export const thumbnailAgentOutputSchema = z.object({
  concepts: z
    .array(
      z.object({
        variant: z.string().max(4),
        concept: z.string().min(5),
        prompt: z.string().min(5),
        overlayText: z.string().max(30),
        ctrPotential: score100,
        reason: z.string().max(400),
      }),
    )
    .min(2),
});
export type ThumbnailAgentOutput = z.infer<typeof thumbnailAgentOutputSchema>;

// ── SEO (spec §28, §29, §30) ─────────────────────────────────────────────────

export const seoAgentOutputSchema = z.object({
  titles: z
    .array(
      z.object({
        text: z.string().min(5).max(100),
        category: z.enum([
          'curiosity',
          'educational',
          'emotional',
          'contrarian',
          'list',
          'story',
          'search',
        ]),
        score: score100,
        reason: z.string().max(300),
      }),
    )
    .min(10),
  description: z.string().min(50).max(4800),
  tags: z.array(z.string().max(40)).min(3).max(40),
  hashtags: z.array(z.string().max(30)).max(5).default([]),
  keywords: z.array(z.string().max(60)).default([]),
});
export type SeoAgentOutput = z.infer<typeof seoAgentOutputSchema>;

// ── QC (spec §26) ────────────────────────────────────────────────────────────

export const qcCheckSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  severity: z.enum(['info', 'warn', 'blocker']),
  detail: z.string().max(600),
});
export type QcCheck = z.infer<typeof qcCheckSchema>;

export const qcAgentOutputSchema = z.object({
  passed: z.boolean(),
  score: score100,
  checks: z.array(qcCheckSchema),
  repairs: z.array(z.string()).default([]),
});
export type QcAgentOutput = z.infer<typeof qcAgentOutputSchema>;

// ── Analytics / strategy (spec §35, §36) ─────────────────────────────────────

export const analyticsAgentOutputSchema = z.object({
  observations: z.array(
    z.object({
      dimension: z.enum(['topic', 'title', 'thumbnail', 'duration', 'hook', 'structure', 'publishTime']),
      observation: z.string(),
      predicted: z.number().optional(),
      actual: z.number().optional(),
      weight: unit.default(0.5),
    }),
  ),
  summary: z.string(),
});
export type AnalyticsAgentOutput = z.infer<typeof analyticsAgentOutputSchema>;

export const strategyAgentOutputSchema = z.object({
  summary: z.string(),
  mix: z.object({
    evergreen: z.number().int().min(0).max(20),
    trending: z.number().int().min(0).max(20),
    experimental: z.number().int().min(0).max(20),
  }),
  recommendations: z.array(
    z.object({
      topic: z.string(),
      type: z.enum(['evergreen', 'trending', 'experimental']),
      reason: z.string(),
      priority: score100,
    }),
  ),
});
export type StrategyAgentOutput = z.infer<typeof strategyAgentOutputSchema>;

export const decisionAgentOutputSchema = z.object({
  choice: z.string(),
  reason: z.string(),
  score: score100.optional(),
  dataUsed: z.record(z.unknown()).default({}),
});
export type DecisionAgentOutput = z.infer<typeof decisionAgentOutputSchema>;

// ── Voice / editing ──────────────────────────────────────────────────────────

export const voiceAgentOutputSchema = z.object({
  segments: z
    .array(
      z.object({
        index: z.number().int().min(0),
        text: z.string().min(1),
        emotion: z.string().optional(),
        pauseAfterMs: z.number().min(0).max(5000).default(300),
      }),
    )
    .min(1),
});
export type VoiceAgentOutput = z.infer<typeof voiceAgentOutputSchema>;

export const agentNameSchema = z.enum(AGENT_NAMES);
