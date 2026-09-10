# Database

> Answers section 84.B. The authoritative definition is `apps/server/prisma/schema.prisma`;
> this explains the shape and the decisions behind it.

Every row is reachable from a user: `User → Channel → Video → …`. Repository reads are scoped
by owner, so cross-tenant access is structurally impossible rather than merely checked.

## Identity and access

| Model | Purpose |
|---|---|
| `User` | Account. First one on an instance becomes `ADMIN`. `passwordHash` is scrypt. |
| `Session` | Opaque server-side sessions. **Only the SHA-256 hash of the token is stored**, so a database leak cannot be replayed as a login. Revocable. |

## Channels

| Model | Purpose |
|---|---|
| `Channel` | A production unit. `platform` selects the publishing adapter, which is what makes TikTok or Reels an adapter rather than a rewrite. |
| `ChannelSettings` | Everything the user configures: niche, language, audience, style, runtime, cadence, automation mode, voice, visual and thumbnail style, timezone and publish days, budget, and the quality gates (`minIdeaScore`, `minQcScore`, `minFactConfidence`, `minRetentionScore`, `maxCostPerVideoUsd`). |
| `OAuthAccount` | `accessToken` and `refreshToken` are **AES-256-GCM ciphertext**, never plaintext. |
| `CompetitorChannel` | Tracked channels plus the last snapshot, so analysis still runs when the API is unavailable. |
| `DiscoverySource` / `TrendSignal` | Where topics come from, and what was observed. |
| `CharacterProfile` | The character bible that keeps a recurring person consistent across scenes and across videos. |

## Ideas and production

| Model | Purpose |
|---|---|
| `ContentIdea` | The twelve scored dimensions plus `overallScore` and `scoreBreakdown` — the breakdown is stored so a ranking can be explained months later. |
| `Video` | The pipeline row. `status` is written only through the state machine. `progress` is a per-stage percentage map; `qualityBreakdown` is the per-dimension score. |
| `Research` / `ResearchSource` | Every claim with its source, type, date, confidence and verdict. A claim with no source cannot be `SUPPORTED`. |
| `Script` | Structure, hook, intro, sections, CTA, word count, retention score and the fact-check report. `revision` increments on every rewrite. |
| `Scene` | The shot list: prompt, negative prompt, camera, motion, lighting, continuity, importance, and the chosen production strategy. |
| `Asset` | Every produced artefact with provider, cost, **licence** and a checksum. The checksum is what makes "this prompt was already rendered" a cheap lookup. |
| `Voiceover` | Narration segments with word-level timings — the source of truth for subtitles and chapters. |
| `Timeline` | The declarative edit document plus the exact FFmpeg command, so a render can be reproduced or explained. |
| `Thumbnail` | Variants with predicted CTR; exactly one is `selected`. |
| `SeoMetadata` | Chosen title, all candidates, description, tags, hashtags, keywords, chapters. |
| `QcReport` | Every check with its severity and detail, plus repair instructions. Appended, never overwritten. |
| `Upload` / `ScheduleSlot` | Upload state machine, and the reserved publishing slot. |

## Learning

| Model | Purpose |
|---|---|
| `AnalyticsSnapshot` | Time series per video — snapshots, not a mutable "current" row, so trends are visible. |
| `Learning` | A weighted, falsifiable observation comparing prediction with reality. |
| `StrategyPlan` | The weekly plan: summary, mix and recommendations. |

## Configuration and audit

| Model | Purpose |
|---|---|
| `ContentTemplate` | A production profile: script structure, visual style, music, scene length, thumbnail style. |
| `PromptTemplate` | Versioned prompts. Agents never contain a prompt literal. |
| `Provider` / `ProviderCredential` | Registry metadata, and per-user keys stored as ciphertext. |
| `ApiUsage` | **Every provider call**, with `jobId / videoId / channelId`, units, estimated and actual cost, latency and status. Cost dashboards and the budget guard read only from here, so they cannot disagree with reality. |
| `AgentRun` | Which agent, which prompt version, which provider, how long, what it cost, and whether it validated. This is what makes prompt A/B comparison possible. |
| `DecisionLog` | Every automated decision with its reason, score and the data used (spec §79). |
| `Job` / `JobError` | Queue mirror: attempts, last error, retry time. Every attempt is recorded, not just the last. |
| `AutomationRule` | Structured conditions — never expressions, so nothing user-supplied is ever evaluated as code. |
| `NotificationTarget` | Where to reach the user, and for which events. |
| `MusicTrack` | The licensed library. `license` is mandatory and QC refuses anything it does not recognise. |

## Notable choices

- **Money is metered, not estimated.** `ApiUsage.actualCost` is written from the vendor's own
  reported usage where one exists; the pre-call estimate is kept alongside it so drift is visible.
- **Snapshots over mutable state.** Analytics and QC accumulate rows. You can always answer
  "what did it look like then?".
- **Explainability is a first-class table.** `DecisionLog` and `AgentRun` exist so the UI can
  show *why*, not just *what*.
- **Deletes cascade from the tenant root.** Removing a channel removes its videos and every
  artefact beneath them.

## Migrations

```bash
npm run prisma:generate --workspace @ycf/server   # client
npm run prisma:dev --workspace @ycf/server        # create a migration in development
npm run prisma:migrate --workspace @ycf/server    # apply in production
```

The domain never imports `@prisma/client`: repositories are ports with a Prisma adapter and an
in-memory adapter, which is what lets the whole pipeline and its tests run without a database.
