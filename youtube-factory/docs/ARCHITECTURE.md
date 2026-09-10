# YouTube Content Factory — Architecture

> Answers section 84 of the specification: A. Architecture, C. Folder structure,
> E. Agent architecture, plus the queue, provider and security models.
> The database schema lives in `DATABASE.md`, the HTTP surface in `API.md`,
> the environment contract in `ENVIRONMENT.md`, the build plan in `ROADMAP.md`.

---

## 1. What this system is

A multi-tenant SaaS that runs YouTube channels close to autonomously. A user connects a
channel, describes the niche/audience/cadence/budget, and turns on Autopilot. From then on
the system discovers topics, scores ideas, researches them against citable sources, writes a
script, fact-checks it, breaks it into scenes, generates visuals and voice, renders an MP4 with
FFmpeg, produces a thumbnail and SEO metadata, runs quality control, schedules the upload,
publishes through the YouTube Data API, collects analytics and feeds the result back into the
next idea.

Two rules shape every design decision below:

1. **Nothing is faked.** Every external integration is implemented against a contract that was
   read from that vendor's real SDK/API definition. Where credentials are missing the provider
   reports `configured: false` and the registry routes elsewhere — it never pretends to work.
2. **The whole pipeline must be runnable without money or network.** Mock providers implement
   the same ports as the real ones, so the end-to-end run (idea → published) executes in CI and
   produces a genuine, playable MP4 through FFmpeg.

---

## 2. Runtime topology

```
                    ┌───────────────────────────────────────────────┐
   Browser ───────► │  apps/web   Next.js 15 dashboard (App Router)  │
                    └───────────────┬───────────────────────────────┘
                                    │  REST + session cookie
                    ┌───────────────▼───────────────────────────────┐
                    │  apps/server  ·  HTTP process (Fastify)        │
                    │  auth · channels · ideas · videos · analytics  │
                    │  costs · templates · providers · webhooks      │
                    └───┬───────────────────────────────┬───────────┘
       enqueue job      │                               │  read/write
                        ▼                               ▼
                 ┌─────────────┐                 ┌──────────────┐
                 │ Redis       │                 │ PostgreSQL   │
                 │ BullMQ      │                 │ Prisma       │
                 └──────┬──────┘                 └──────▲───────┘
                        │ reserve                       │
                    ┌───▼───────────────────────────────┴───────────┐
                    │  apps/server  ·  worker process               │
                    │  PipelineRunner → steps → agents → providers  │
                    │  FFmpeg render · QC · upload · analytics       │
                    └───┬───────────────────────────────┬───────────┘
                        │                               │
                 ┌──────▼───────┐               ┌───────▼─────────────────────┐
                 │ S3 / MinIO   │               │ Anthropic · OpenAI ·        │
                 │ (or local FS)│               │ Higgsfield · ElevenLabs ·   │
                 └──────────────┘               │ YouTube · Trends · RSS      │
                                                └─────────────────────────────┘
```

The HTTP process **never** does generation work. Section 69 of the spec is enforced
structurally: routes may only create a `Job` row and enqueue it. All long work happens in the
worker process, which reports progress into `Video.progress` (a per-stage JSON map) that the UI
polls.

Both processes are the same package (`apps/server`) with two entrypoints — `src/main/api.ts`
and `src/main/worker.ts` — so domain code cannot drift between them.

---

## 3. Layering

```
                 ┌──────────────────────────────────────────┐
   http/ cli/    │  Delivery      Fastify routes, CLI, bot   │  ← may depend on everything below
                 ├──────────────────────────────────────────┤
   pipeline/     │  Orchestration state machine + steps      │
   services/     │                autopilot, scheduler,      │
                 │                budget, cost, learning     │
                 ├──────────────────────────────────────────┤
   agents/       │  Reasoning     16 typed agents            │
                 ├──────────────────────────────────────────┤
   providers/    │  Ports+Adapters AI / video / TTS / YouTube│
   media/        │                FFmpeg render + probe      │
   storage/      │                S3 / local                 │
   queue/        │                BullMQ / in-memory         │
   db/           │                Prisma / in-memory repos   │
                 ├──────────────────────────────────────────┤
   shared/       │  Domain        types, zod schemas, scores │  ← depends on nothing
                 └──────────────────────────────────────────┘
```

Dependencies point downward only. Every outward-facing capability is a **port** (a TypeScript
interface in the layer that needs it) with at least two **adapters**: a real one and one that
runs offline. That is what makes the acceptance run in section 83 executable in CI.

| Port | Real adapter | Offline adapter |
|---|---|---|
| `TextProvider` / `StructuredProvider` | `AnthropicProvider`, `OpenAIProvider` | `MockLLMProvider` |
| `ImageProvider` | `HiggsfieldProvider` (Soul), `OpenAIImageProvider` | `MockImageProvider` |
| `VideoProvider` | `HiggsfieldProvider` (DoP image2video) | `MockVideoProvider` |
| `VoiceProvider` | `ElevenLabsProvider` | `MockVoiceProvider` |
| `MusicProvider` | `LocalLibraryMusicProvider` (licensed local library) | same |
| `YouTubeProvider` | `YouTubeApiProvider` (OAuth2 + Data API v3) | `MockYouTubeProvider` |
| `DiscoverySource` | `YouTubeSearchSource`, `GoogleTrendsSource`, `RssSource`, `WikipediaSource`, `RedditSource` | `MockDiscoverySource` |
| `JobQueue` | `BullMqQueue` | `InMemoryQueue` |
| `Storage` | `S3Storage` | `LocalStorage` |
| `Repositories` | `PrismaRepositories` | `InMemoryRepositories` |
| `Notifier` | `EmailNotifier`, `TelegramNotifier`, `DiscordNotifier`, `SlackNotifier` | `MemoryNotifier` |
| `Clock` | `SystemClock` | `FixedClock` |

---

## 4. Provider abstraction (spec §3, §19, §64)

`ProviderRegistry` holds every configured adapter and answers one question:

> *Given capability C, this channel's constraints, the remaining budget and a required quality
> tier, which adapter should run this call — and what will it cost?*

```ts
interface AIProvider {
  readonly id: string;               // 'anthropic', 'higgsfield', …
  readonly capabilities: Capability[];
  isConfigured(): boolean;           // false ⇒ never selected, never throws at import time
  estimateCost(op: Operation): Money;
  health(): Promise<ProviderHealth>;
}
```

Capability mixins (a provider implements the ones it supports):

```
generateText            generateStructuredOutput      analyzeText
research                generateImage                 generateVideo
generateVoice           generateMusic
```

**Selection algorithm** (`ProviderRouter.select`):

1. Filter to providers that are configured *and* declare the capability.
2. Drop any provider whose circuit breaker is open (5 failures / 60 s window).
3. Drop any whose estimated cost would push the channel past its monthly budget ceiling
   (unless the operation is marked `essential`).
4. Sort by `(qualityTier ≥ required) desc, estimatedCost asc, p95Latency asc`.
5. Return an ordered list. The caller runs `#1`; on failure the retry policy walks the list —
   that is the fallback chain of spec §64.

Every call is wrapped by `MeteredProvider`, a decorator that writes an `ApiUsage` row with
`jobId / videoId / channelId / provider / operation / estimatedCost / actualCost / latencyMs /
status`. Cost dashboards (§41) and budget protection (§42) read only from that table, so they
can never disagree with what actually happened.

### Verified vendor contracts

Implemented from the vendor's own published definition, not from memory:

| Provider | Base URL | Auth | Endpoints used |
|---|---|---|---|
| Anthropic | `https://api.anthropic.com` | `x-api-key`, `anthropic-version: 2023-06-01` | `POST /v1/messages` (tool-use forced for structured output) |
| OpenAI | `https://api.openai.com` | `Authorization: Bearer` | `POST /v1/chat/completions` (json_schema), `POST /v1/images/generations` |
| Higgsfield | `https://platform.higgsfield.ai` | `Authorization: Key KEY_ID:KEY_SECRET` | `POST /v1/text2image/soul`, `POST /v1/image2video/dop`, `GET /requests/{id}/status`, `?hf_webhook=` |
| ElevenLabs | `https://api.elevenlabs.io` | `xi-api-key` | `POST /v1/text-to-speech/{voice_id}/with-timestamps` → `audio_base64` + `alignment.character_start_times_seconds` |
| YouTube | `https://www.googleapis.com` + `https://oauth2.googleapis.com` | OAuth 2.0 refresh token | `youtube/v3/channels`, `search`, `videos`, resumable `upload/youtube/v3/videos`, `thumbnails/set`, `youtubeAnalytics/v2/reports` |

Higgsfield exposes **no text-to-video endpoint**. Text→video is therefore implemented honestly
as `text2image/soul` → `image2video/dop`, which is what the vendor's own SDK supports.

---

## 5. Agent architecture (spec §76, §77)

An agent is a pure function `(typed input, context) → typed output` with a versioned prompt.

```ts
abstract class Agent<I, O> {
  abstract readonly name: AgentName;
  abstract readonly inputSchema: ZodType<I>;
  abstract readonly outputSchema: ZodType<O>;
  abstract readonly promptName: string;      // resolved through PromptLibrary, never inlined
  async run(input: I, ctx: AgentContext): Promise<AgentResult<O>>;
}
```

`Agent.run` is the only place that talks to an LLM and it always does the same six things:

1. `inputSchema.parse(input)` — a malformed call fails before it costs anything.
2. `PromptLibrary.resolve(promptName, channel)` — returns the **active version** of the prompt
   (`system_prompt`, `user_template`, `variables`) for that channel. Prompts live in the DB and
   are seeded from `src/agents/prompts/seed`. Never hard-coded at the call site (§51).
3. `ProviderRouter.select('generateStructuredOutput', …)` and call with the output JSON Schema
   derived from `outputSchema`.
4. `outputSchema.safeParse` on the response. On failure: one repair round-trip that shows the
   model its own output plus the validation errors; then the next provider in the chain.
5. Emit an `AgentRun` record: prompt name + version, provider, tokens, cost, latency, verdict.
   This is what powers prompt A/B comparison (§51) and explainability (§79).
6. Return `AgentResult<O>` = `{ output, decision: Decision, usage: Usage }` where `Decision`
   carries `{ decision, reason, score, dataUsed }` so every automated choice is explainable.

The sixteen agents and their contracts:

| Agent | Input | Output |
|---|---|---|
| `IDEA_AGENT` | niche, audience, trends, competitor topics, past performance | `ContentIdea[]` with 12 scored dimensions |
| `COMPETITOR_AGENT` | competitor channel snapshots | topic clusters, cadence, format patterns |
| `RESEARCH_AGENT` | topic, depth | `ResearchFinding[]` each with claim/source/url/date/confidence |
| `FACT_CHECK_AGENT` | script + findings | per-claim verdict `SUPPORTED / UNVERIFIED / CONTRADICTED` |
| `SCRIPT_AGENT` | topic, research, audience, style, target duration | `Script` (hook, sections, transitions, CTA) |
| `RETENTION_AGENT` | script | retention score + concrete rewrite instructions |
| `SCENE_AGENT` | script | `Scene[]` with prompts, camera, motion, continuity |
| `VISUAL_AGENT` | scene | chosen strategy (`stock` / `image+motion` / `video`) + prompt pair |
| `VOICE_AGENT` | script, voice profile | narration segments + delivery notes |
| `EDITING_AGENT` | scenes, voiceover timings | `Timeline` (cuts, transitions, overlays, music, SFX) |
| `THUMBNAIL_AGENT` | title, topic, style | 3 thumbnail concepts + predicted CTR |
| `SEO_AGENT` | script, research | title candidates, description, tags, hashtags, chapters |
| `QC_AGENT` | probe report + all scores | pass/fail + repair instructions |
| `ANALYTICS_AGENT` | published metrics | what worked / what did not, per dimension |
| `STRATEGY_AGENT` | last 20 videos, analytics, competitors, trends | next week's content plan |
| `DECISION_AGENT` | any decision point + options + data | chosen option + reason + score |

---

## 6. Pipeline & queue architecture (spec §7, §43, §69)

### The state machine

```
IDEA → RESEARCHING → RESEARCH_COMPLETE → SCRIPTING → SCRIPT_READY → FACT_CHECK
     → SCENE_PLANNING → GENERATING_VISUALS → GENERATING_VOICE → EDITING → QC
     → THUMBNAIL → SEO → READY → SCHEDULED → PUBLISHED → ANALYZING
                                   ↘ FAILED (from any state)
```

`VideoStateMachine` owns the legal transitions. Nothing else may write `Video.status`; an
illegal transition throws. Each state maps to a `PipelineStep`:

```ts
interface PipelineStep {
  readonly from: VideoStatus;        // guard: only runs when the video is here
  readonly to: VideoStatus;          // where success lands
  readonly name: StepName;
  estimateCost(ctx): Money;
  execute(ctx: StepContext): Promise<StepResult>;
}
```

`PipelineRunner.advance(videoId)` loads the video, finds the step whose `from` matches, checks
the budget and the channel's automation rules, runs it, persists the outputs and the new status,
records progress, then **enqueues the next advance**. One job = one step, which means a failure
retries only that step and never re-pays for the previous ones.

### Queue

`JobQueue` port with `enqueue / process / schedule / cancel`. `BullMqQueue` is the production
adapter (Redis, exponential backoff, dead-letter). `InMemoryQueue` is a full implementation
(delays, retries, concurrency) used by tests and `--offline` mode, so the acceptance run needs
no Redis.

Queues: `pipeline` (per-step advance), `discovery` (trend crawls), `analytics` (post-publish
polling), `maintenance` (weekly strategy, reports, budget rollover).

### Retry and fallback (§43, §64)

Per step: `attempt < maxAttempts` → retry with jittered exponential backoff. On the last
attempt, `ProviderRouter` moves to the next provider in the chain. When the chain is exhausted,
degraded strategies kick in — a failed video generation falls back to image + Ken Burns motion,
a failed TTS provider falls back to the next configured voice provider — and only when nothing
remains does the video go `FAILED` with a `JobError` explaining every attempt.

---

## 7. Money (spec §19, §41, §42)

`CostEstimator` prices an operation *before* it runs from a per-provider rate card
(`providers/rates.ts`). `BudgetGuard.check(channelId, estimate)` compares month-to-date spend
from `ApiUsage` against `ChannelSettings.monthlyBudgetUsd`:

| Utilisation | Behaviour |
|---|---|
| < 80 % | proceed |
| ≥ 80 % | proceed, emit `BUDGET_WARNING` notification once |
| ≥ 90 % | proceed, second warning, downgrade optional operations to their cheap tier |
| ≥ 100 % | block every non-essential operation; pipeline parks the video in its current state and requires explicit approval |

`CostOptimizer` runs before each generation and answers "can this be cheaper without hurting
the video?" — reusing an existing asset, choosing stock over generation, choosing
image+motion over full video generation for low-importance scenes, choosing a cheaper model for
mechanical tasks. Every downgrade is written to the decision log so the user can see why.

---

## 8. Rendering (spec §24, §25, §68)

The `EDITING_AGENT` emits a `Timeline` — a declarative, provider-agnostic JSON document. The
`FfmpegRenderer` compiles it into a single `ffmpeg` invocation:

* every scene normalised to 1920×1080 (or 3840×2160), constant fps, square pixels;
* images animated with `zoompan` (Ken Burns), video clips trimmed to their slot;
* scene joins via `xfade` when a transition is requested, plain `concat` otherwise;
* `drawtext` overlays, optional burned-in captions via the `subtitles` filter;
* voiceover concatenated with `adelay`, then `loudnorm` to −16 LUFS;
* music `sidechaincompress`-ducked against the voice bus, SFX mixed with `amix`;
* `libx264 / yuv420p / +faststart` video, `aac` audio.

`FfprobeInspector` then measures the artefact for QC. The renderer is pure: `Timeline` in,
command line out, which means the filter graph is unit-testable without executing FFmpeg — and
a separate integration test does execute it and asserts on the real output file.

---

## 9. Security model (spec §46)

* **Sessions** — opaque 256-bit tokens, only a SHA-256 hash stored, `HttpOnly / Secure /
  SameSite=Lax` cookie, server-side revocation, sliding 30-day expiry. No JWT, so logout and
  ban are immediate.
* **Passwords** — `scrypt` (N=16384, r=8, p=1) with a 16-byte random salt, constant-time compare.
* **OAuth tokens at rest** — AES-256-GCM (`ENCRYPTION_KEY`, 32 bytes hex) with a per-record IV
  and auth tag. Refresh tokens never leave the server and are never logged; `SecretString`
  redacts itself in any serialisation path.
* **CSRF** — double-submit cookie plus `Origin` checking on every unsafe method.
* **Authorisation** — every repository read is scoped by `userId`; `requireChannel` resolves and
  asserts ownership before a route body ever runs. Roles: `USER`, `ADMIN`.
* **Rate limiting** — global, per-IP on auth routes, and per-user on generation routes.
* **Input validation** — every route body/query goes through zod before reaching a handler.
* **SQL injection** — Prisma parameterised queries only; no raw SQL in the codebase.
* **XSS** — React escaping plus a strict CSP header; no `dangerouslySetInnerHTML`.
* **Webhooks** — HMAC-SHA256 signature with timing-safe comparison and a replay window.
* **Secrets** — only ever read from `process.env` through a validated config module. No key is
  ever written to the database, a log line, or the client.

---

## 10. Platform safety (spec §53, §54, §80)

* Research findings carry a source URL and a confidence value. A claim without a source is
  marked `UNVERIFIED` and the script writer is forbidden from stating it as fact.
* `FactConfidenceScore` gates publishing — under the channel's threshold the video cannot be
  scheduled automatically.
* Music assets carry an explicit `license` field; the QC step refuses any track whose licence
  is not `owned`, `royalty_free`, `cc_by` (with attribution rendered) or `licensed`.
* Originality: the system researches sources and writes from them; it never rewrites a single
  source document, and the QC step flags any n-gram overlap above threshold with a source.
* Nothing in the codebase attempts to evade rate limits, copyright detection, authentication or
  any platform control. Quota is respected by backing off, never by rotating credentials.

---

## 11. Multi-platform future (spec §86)

Publishing is behind a `PublishingPlatform` port (`connect / listChannels / upload / schedule /
metrics`). YouTube is one implementation. The pipeline speaks only to the port, and
`Channel.platform` selects the adapter, so TikTok / Reels / X / Podcast are new adapters plus a
render preset (aspect ratio, duration cap) — no change to the core.

---

## 12. Folder structure (spec §84.C)

```
youtube-factory/
├── docs/                       ARCHITECTURE · DATABASE · API · AGENTS · ENVIRONMENT · ROADMAP · RUNBOOK
├── docker-compose.yml          postgres · redis · minio · api · worker · web
├── package.json                npm workspaces root
├── apps/
│   ├── server/
│   │   ├── prisma/schema.prisma
│   │   └── src/
│   │       ├── shared/         types, zod schemas, scoring, errors, ids, logger, clock, result
│   │       ├── config/         validated env → typed config
│   │       ├── db/             repository ports · in-memory adapters · prisma adapters
│   │       ├── queue/          JobQueue port · BullMQ adapter · in-memory adapter
│   │       ├── storage/        Storage port · S3 adapter · local adapter · key layout
│   │       ├── providers/      ports · registry · router · rates · adapters/* · mock/*
│   │       ├── agents/         framework · prompts (library + seeds) · 16 agents
│   │       ├── media/          ffmpeg renderer · probe · captions · audio mix
│   │       ├── pipeline/       state machine · steps/* · runner
│   │       ├── services/       cost · budget · scheduler · autopilot · discovery ·
│   │       │                   learning · strategy · notifications · rules · quality
│   │       ├── http/           fastify app · middleware · routes/*
│   │       ├── main/           api.ts · worker.ts
│   │       ├── cli/            factory CLI (seed, run-pipeline, autopilot, doctor)
│   │       └── test/           unit · integration · api · e2e
│   └── web/                    Next.js 15 App Router dashboard (Tailwind + shadcn-style UI)
└── .env.example
```
