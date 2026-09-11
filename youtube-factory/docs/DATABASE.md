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

The initial migration is checked in at
`apps/server/prisma/migrations/20260911095430_initial_schema/migration.sql` — 38 tables, their
enums, indexes and foreign keys. It has to exist in the repository: `prisma migrate deploy`
applies migrations, it does not derive them, so a deploy against an empty database would
otherwise do nothing at all and the API would start against no tables.

```bash
npm run prisma:generate --workspace @ycf/server   # client
npm run prisma:dev --workspace @ycf/server        # create a migration in development
npm run prisma:migrate --workspace @ycf/server    # apply in production
```

`docker compose` runs `prisma migrate deploy` before the API starts, so a fresh stack comes up
with the schema already applied.

## Two adapters, one contract

The domain never imports `@prisma/client`: repositories are ports with a Prisma adapter and an
in-memory adapter, which is what lets the whole pipeline and its tests run without a database.

That only holds if the two adapters actually agree, so `src/test/repositories.test.ts` runs one
set of assertions against both — the in-memory one always, the Prisma one whenever
`TEST_DATABASE_URL` is set:

```bash
cd apps/server
TEST_DATABASE_URL=postgresql://factory:factory@127.0.0.1:5432/factory npm test
```

It pins the behaviour that differs when you are not careful: duplicate keys surfacing as a
domain conflict rather than a driver error, case-insensitive email lookup, ordering with a
deterministic tiebreaker when two rows share a millisecond, 64-bit counters surviving a round
trip (view counts past 2³¹, file sizes past 4 GiB), JSON and array columns coming back with the
same shape, cascade deletes reaching every child table, and every writable column surviving
`create`. That last one is not hypothetical — it caught the Prisma `videos.create` silently
dropping `publishAt` and thirteen other fields, which showed up only as a scheduler that never
found anything to publish.
