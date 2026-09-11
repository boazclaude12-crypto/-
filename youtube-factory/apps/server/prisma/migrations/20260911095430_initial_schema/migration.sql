-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('YOUTUBE', 'TIKTOK', 'INSTAGRAM', 'X', 'FACEBOOK', 'PODCAST');

-- CreateEnum
CREATE TYPE "AutomationMode" AS ENUM ('FULL_AUTO', 'SEMI_AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('YOUTUBE', 'GOOGLE_TRENDS', 'REDDIT', 'RSS', 'NEWS_API', 'WIKIPEDIA', 'WEBSITE', 'MANUAL');

-- CreateEnum
CREATE TYPE "IdeaStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED', 'IN_PRODUCTION', 'PRODUCED');

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('IDEA', 'RESEARCHING', 'RESEARCH_COMPLETE', 'SCRIPTING', 'SCRIPT_READY', 'FACT_CHECK', 'SCENE_PLANNING', 'GENERATING_VISUALS', 'GENERATING_VOICE', 'EDITING', 'QC', 'THUMBNAIL', 'SEO', 'READY', 'SCHEDULED', 'PUBLISHED', 'ANALYZING', 'FAILED');

-- CreateEnum
CREATE TYPE "ClaimVerdict" AS ENUM ('SUPPORTED', 'UNVERIFIED', 'CONTRADICTED');

-- CreateEnum
CREATE TYPE "SceneStrategy" AS ENUM ('STOCK', 'IMAGE_MOTION', 'GENERATED_VIDEO', 'EXISTING_MEDIA');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'MUSIC', 'SFX', 'THUMBNAIL', 'CAPTION', 'RENDER');

-- CreateEnum
CREATE TYPE "UploadState" AS ENUM ('PENDING', 'UPLOADING', 'PROCESSING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "JobState" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'WAITING_APPROVAL');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channels" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL DEFAULT 'YOUTUBE',
    "youtubeChannelId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "thumbnailUrl" TEXT,
    "subscriberCount" INTEGER,
    "videoCount" INTEGER,
    "viewCount" BIGINT,
    "statsFetchedAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_settings" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "niche" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "targetAudience" TEXT NOT NULL,
    "contentStyle" TEXT NOT NULL DEFAULT 'documentary',
    "targetDurationMin" INTEGER NOT NULL DEFAULT 10,
    "videosPerWeek" INTEGER NOT NULL DEFAULT 3,
    "automationMode" "AutomationMode" NOT NULL DEFAULT 'SEMI_AUTO',
    "autopilotEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autopilotRunAt" TEXT NOT NULL DEFAULT '06:00',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "defaultPublishTime" TEXT NOT NULL DEFAULT '18:00',
    "publishDays" INTEGER[] DEFAULT ARRAY[1, 3, 5]::INTEGER[],
    "privacyStatus" TEXT NOT NULL DEFAULT 'private',
    "voiceProviderId" TEXT,
    "voiceId" TEXT,
    "voiceSettings" JSONB,
    "visualStyle" TEXT NOT NULL DEFAULT 'cinematic documentary',
    "thumbnailStyle" TEXT NOT NULL DEFAULT 'high-contrast subject with 3 word overlay',
    "musicMood" TEXT NOT NULL DEFAULT 'neutral cinematic',
    "monthlyBudgetUsd" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "minIdeaScore" DOUBLE PRECISION NOT NULL DEFAULT 70,
    "minQcScore" DOUBLE PRECISION NOT NULL DEFAULT 75,
    "minFactConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "minRetentionScore" DOUBLE PRECISION NOT NULL DEFAULT 70,
    "maxCostPerVideoUsd" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "ideaWeights" JSONB,
    "bufferTargetVideos" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_accounts" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'google',
    "externalAccountId" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "scope" TEXT NOT NULL,
    "tokenType" TEXT NOT NULL DEFAULT 'Bearer',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_channels" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "youtubeChannelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subscriberCount" INTEGER,
    "uploadFrequency" DOUBLE PRECISION,
    "avgViews" DOUBLE PRECISION,
    "avgDurationSec" INTEGER,
    "lastAnalyzedAt" TIMESTAMP(3),
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitor_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discovery_sources" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "kind" "SourceKind" NOT NULL,
    "label" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discovery_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trend_signals" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "kind" "SourceKind" NOT NULL,
    "topic" TEXT NOT NULL,
    "url" TEXT,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "velocity" DOUBLE PRECISION,
    "raw" JSONB,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trend_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_ideas" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "targetAudience" TEXT NOT NULL,
    "rationale" TEXT,
    "status" "IdeaStatus" NOT NULL DEFAULT 'PROPOSED',
    "estimatedDemand" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "competition" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "novelty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evergreenScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trendScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "productionCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimatedCtr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimatedRetention" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overallScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scoreBreakdown" JSONB,
    "sourceSignals" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_ideas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videos" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "ideaId" TEXT,
    "templateId" TEXT,
    "title" TEXT NOT NULL,
    "status" "VideoStatus" NOT NULL DEFAULT 'IDEA',
    "previousStatus" "VideoStatus",
    "progress" JSONB,
    "targetDurationSec" INTEGER NOT NULL DEFAULT 600,
    "actualDurationSec" DOUBLE PRECISION,
    "language" TEXT NOT NULL DEFAULT 'en',
    "renderKey" TEXT,
    "renderWidth" INTEGER,
    "renderHeight" INTEGER,
    "fileSizeBytes" BIGINT,
    "qualityScore" DOUBLE PRECISION,
    "qualityBreakdown" JSONB,
    "factConfidence" DOUBLE PRECISION,
    "retentionScore" DOUBLE PRECISION,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "failureReason" TEXT,
    "publishAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "youtubeVideoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "depth" TEXT NOT NULL DEFAULT 'standard',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openQuestions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_sources" (
    "id" TEXT NOT NULL,
    "researchId" TEXT NOT NULL,
    "claim" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceType" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "verdict" "ClaimVerdict" NOT NULL DEFAULT 'UNVERIFIED',
    "notes" TEXT,

    CONSTRAINT "research_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scripts" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "structure" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "intro" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "cta" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "estimatedDuration" DOUBLE PRECISION NOT NULL,
    "retentionScore" DOUBLE PRECISION,
    "retentionNotes" JSONB,
    "factCheckScore" DOUBLE PRECISION,
    "factCheckReport" JSONB,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenes" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "durationSec" DOUBLE PRECISION NOT NULL,
    "narration" TEXT NOT NULL,
    "visualBrief" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "negativePrompt" TEXT,
    "camera" TEXT,
    "style" TEXT,
    "aspectRatio" TEXT NOT NULL DEFAULT '16:9',
    "characters" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "location" TEXT,
    "lighting" TEXT,
    "motion" TEXT,
    "continuityNotes" TEXT,
    "textOverlay" TEXT,
    "sfx" TEXT,
    "importance" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "strategy" "SceneStrategy" NOT NULL DEFAULT 'IMAGE_MOTION',
    "assetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "videoId" TEXT,
    "kind" "AssetKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" INTEGER,
    "durationSec" DOUBLE PRECISION,
    "width" INTEGER,
    "height" INTEGER,
    "provider" TEXT,
    "externalId" TEXT,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "license" TEXT,
    "attribution" TEXT,
    "checksum" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voiceovers" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "durationSec" DOUBLE PRECISION NOT NULL,
    "provider" TEXT NOT NULL,
    "voiceId" TEXT NOT NULL,
    "wordTimings" JSONB,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voiceovers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timelines" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "document" JSONB NOT NULL,
    "renderCmd" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thumbnails" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "storageKey" TEXT,
    "ctrPotential" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thumbnails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seo_metadata" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleCandidates" JSONB NOT NULL,
    "description" TEXT NOT NULL,
    "tags" TEXT[],
    "hashtags" TEXT[],
    "keywords" TEXT[],
    "chapters" JSONB NOT NULL,
    "categoryId" TEXT NOT NULL DEFAULT '27',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seo_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qc_reports" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "checks" JSONB NOT NULL,
    "failures" JSONB NOT NULL,
    "repairs" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qc_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploads" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "state" "UploadState" NOT NULL DEFAULT 'PENDING',
    "privacyStatus" TEXT NOT NULL DEFAULT 'private',
    "youtubeVideoId" TEXT,
    "resumableUri" TEXT,
    "bytesUploaded" BIGINT NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_slots" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "videoId" TEXT,
    "publishAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "reserved" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_snapshots" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "views" INTEGER NOT NULL DEFAULT 0,
    "watchTimeMinutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averageViewDuration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averageViewPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "ctr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "subscribersGained" INTEGER NOT NULL DEFAULT 0,
    "estimatedRevenueUsd" DOUBLE PRECISION,
    "raw" JSONB,

    CONSTRAINT "analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learnings" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "videoId" TEXT,
    "dimension" TEXT NOT NULL,
    "observation" TEXT NOT NULL,
    "predicted" DOUBLE PRECISION,
    "actual" DOUBLE PRECISION,
    "delta" DOUBLE PRECISION,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategy_plans" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "summary" TEXT NOT NULL,
    "recommendations" JSONB NOT NULL,
    "mix" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strategy_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_templates" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scriptStructure" JSONB NOT NULL,
    "visualStyle" TEXT NOT NULL,
    "voiceProfile" JSONB,
    "musicMood" TEXT,
    "sceneDurationSec" DOUBLE PRECISION NOT NULL DEFAULT 7,
    "thumbnailStyle" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_templates" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "provider" TEXT,
    "systemPrompt" TEXT NOT NULL,
    "userTemplate" TEXT NOT NULL,
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capabilities" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_credentials" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "hint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_usage" (
    "id" TEXT NOT NULL,
    "channelId" TEXT,
    "videoId" TEXT,
    "jobId" TEXT,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "model" TEXT,
    "inputUnits" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outputUnits" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'token',
    "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "videoId" TEXT,
    "agent" TEXT NOT NULL,
    "promptId" TEXT,
    "promptName" TEXT NOT NULL,
    "promptVersion" INTEGER NOT NULL DEFAULT 1,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision_logs" (
    "id" TEXT NOT NULL,
    "videoId" TEXT,
    "channelId" TEXT,
    "subject" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "dataUsed" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "queue" TEXT NOT NULL DEFAULT 'pipeline',
    "name" TEXT NOT NULL,
    "channelId" TEXT,
    "videoId" TEXT,
    "state" "JobState" NOT NULL DEFAULT 'QUEUED',
    "payload" JSONB NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "retryAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_errors" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "provider" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_rules" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "condition" JSONB NOT NULL,
    "action" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_targets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "events" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_profiles" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age" TEXT,
    "gender" TEXT,
    "clothing" TEXT,
    "hair" TEXT,
    "face" TEXT,
    "bodyType" TEXT,
    "style" TEXT,
    "referenceKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "music_tracks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "license" TEXT NOT NULL,
    "attribution" TEXT,
    "durationSec" DOUBLE PRECISION NOT NULL,
    "mood" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "bpm" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "music_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "channels_userId_idx" ON "channels"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "channels_userId_youtubeChannelId_key" ON "channels"("userId", "youtubeChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "channel_settings_channelId_key" ON "channel_settings"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_accounts_channelId_key" ON "oauth_accounts"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "competitor_channels_channelId_youtubeChannelId_key" ON "competitor_channels"("channelId", "youtubeChannelId");

-- CreateIndex
CREATE INDEX "discovery_sources_channelId_idx" ON "discovery_sources"("channelId");

-- CreateIndex
CREATE INDEX "trend_signals_sourceId_observedAt_idx" ON "trend_signals"("sourceId", "observedAt");

-- CreateIndex
CREATE INDEX "content_ideas_channelId_status_idx" ON "content_ideas"("channelId", "status");

-- CreateIndex
CREATE INDEX "videos_channelId_status_idx" ON "videos"("channelId", "status");

-- CreateIndex
CREATE INDEX "videos_status_publishAt_idx" ON "videos"("status", "publishAt");

-- CreateIndex
CREATE UNIQUE INDEX "research_videoId_key" ON "research"("videoId");

-- CreateIndex
CREATE INDEX "research_sources_researchId_idx" ON "research_sources"("researchId");

-- CreateIndex
CREATE UNIQUE INDEX "scripts_videoId_key" ON "scripts"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "scenes_videoId_index_key" ON "scenes"("videoId", "index");

-- CreateIndex
CREATE INDEX "assets_videoId_kind_idx" ON "assets"("videoId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "voiceovers_videoId_index_key" ON "voiceovers"("videoId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "timelines_videoId_key" ON "timelines"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "thumbnails_videoId_variant_key" ON "thumbnails"("videoId", "variant");

-- CreateIndex
CREATE UNIQUE INDEX "seo_metadata_videoId_key" ON "seo_metadata"("videoId");

-- CreateIndex
CREATE INDEX "qc_reports_videoId_idx" ON "qc_reports"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "uploads_videoId_key" ON "uploads"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_slots_videoId_key" ON "schedule_slots"("videoId");

-- CreateIndex
CREATE INDEX "schedule_slots_channelId_publishAt_idx" ON "schedule_slots"("channelId", "publishAt");

-- CreateIndex
CREATE INDEX "analytics_snapshots_videoId_capturedAt_idx" ON "analytics_snapshots"("videoId", "capturedAt");

-- CreateIndex
CREATE INDEX "learnings_channelId_dimension_idx" ON "learnings"("channelId", "dimension");

-- CreateIndex
CREATE UNIQUE INDEX "strategy_plans_channelId_weekStart_key" ON "strategy_plans"("channelId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "content_templates_userId_name_key" ON "content_templates"("userId", "name");

-- CreateIndex
CREATE INDEX "prompt_templates_name_active_idx" ON "prompt_templates"("name", "active");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_templates_name_version_userId_key" ON "prompt_templates"("name", "version", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "providers_key_key" ON "providers"("key");

-- CreateIndex
CREATE UNIQUE INDEX "provider_credentials_userId_providerKey_key" ON "provider_credentials"("userId", "providerKey");

-- CreateIndex
CREATE INDEX "api_usage_channelId_createdAt_idx" ON "api_usage"("channelId", "createdAt");

-- CreateIndex
CREATE INDEX "api_usage_provider_createdAt_idx" ON "api_usage"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "agent_runs_agent_createdAt_idx" ON "agent_runs"("agent", "createdAt");

-- CreateIndex
CREATE INDEX "decision_logs_videoId_idx" ON "decision_logs"("videoId");

-- CreateIndex
CREATE INDEX "decision_logs_channelId_createdAt_idx" ON "decision_logs"("channelId", "createdAt");

-- CreateIndex
CREATE INDEX "jobs_state_retryAt_idx" ON "jobs"("state", "retryAt");

-- CreateIndex
CREATE INDEX "jobs_videoId_idx" ON "jobs"("videoId");

-- CreateIndex
CREATE INDEX "job_errors_jobId_idx" ON "job_errors"("jobId");

-- CreateIndex
CREATE INDEX "automation_rules_channelId_enabled_idx" ON "automation_rules"("channelId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "notification_targets_userId_kind_target_key" ON "notification_targets"("userId", "kind", "target");

-- CreateIndex
CREATE UNIQUE INDEX "character_profiles_channelId_name_key" ON "character_profiles"("channelId", "name");

-- CreateIndex
CREATE INDEX "music_tracks_mood_idx" ON "music_tracks"("mood");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_settings" ADD CONSTRAINT "channel_settings_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_channels" ADD CONSTRAINT "competitor_channels_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovery_sources" ADD CONSTRAINT "discovery_sources_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trend_signals" ADD CONSTRAINT "trend_signals_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "discovery_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_ideas" ADD CONSTRAINT "content_ideas_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "content_ideas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "content_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research" ADD CONSTRAINT "research_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_researchId_fkey" FOREIGN KEY ("researchId") REFERENCES "research"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voiceovers" ADD CONSTRAINT "voiceovers_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timelines" ADD CONSTRAINT "timelines_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thumbnails" ADD CONSTRAINT "thumbnails_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seo_metadata" ADD CONSTRAINT "seo_metadata_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_reports" ADD CONSTRAINT "qc_reports_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnings" ADD CONSTRAINT "learnings_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnings" ADD CONSTRAINT "learnings_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategy_plans" ADD CONSTRAINT "strategy_plans_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_templates" ADD CONSTRAINT "content_templates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "prompt_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_logs" ADD CONSTRAINT "decision_logs_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_errors" ADD CONSTRAINT "job_errors_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_targets" ADD CONSTRAINT "notification_targets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_profiles" ADD CONSTRAINT "character_profiles_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
