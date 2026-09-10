# Implementation roadmap

> Answers section 84.G, and records what was actually built in each phase rather than what was
> planned. Every phase below is complete and covered by tests.

| Phase | Scope | State |
|---|---|---|
| 1 · Foundation | Domain types and zod schemas, scoring formulas, crypto, validated config, Prisma schema (28 models), repository ports with in-memory *and* Prisma adapters, sessions and RBAC | ✅ |
| 2 · Providers | Capability-based ports, registry with cost/health/circuit-breaker routing, metering decorator, rate card, adapters for Anthropic, OpenAI, Higgsfield, ElevenLabs, YouTube, a local FFmpeg generator, and the mock set | ✅ |
| 3 · Agents | Agent framework (validate → resolve prompt → route → validate → record → explain), 16 agents, prompt library with versioning and A/B statistics | ✅ |
| 4 · Pipeline | State machine over the 18 statuses, 13 steps, runner with per-step jobs, retry and provider fallback, budget guard, cost optimiser, rules engine, scheduler, discovery, autopilot, learning, strategy | ✅ |
| 5 · Media | Timeline model, FFmpeg compiler (Ken Burns, xfade, overlays, burned-in captions, watermark, ducking, loudnorm), SFX synthesis, SRT/VTT from word timings, chapters, ffprobe-based QC | ✅ |
| 6 · Delivery | Fastify API (60+ routes), YouTube OAuth and resumable upload, analytics collection, signed webhooks, notification abstraction, Telegram bot, worker with periodic sweeps | ✅ |
| 7 · Dashboard | Next.js 15 App Router, 15 screens, shadcn-style component library, live pipeline polling | ✅ |
| 8 · Verification | 119 tests including four full-pipeline runs that render real MP4s; a Playwright walkthrough of all 15 screens | ✅ |

## Acceptance criteria (spec §83)

| Criterion | Where it is proven |
|---|---|
| User can create an account | `api.test.ts` → "registers, authenticates and logs out" |
| User can connect YouTube | `api.test.ts` → signed authorize URL; `harness.ts` → `connectChannel`; `channels.ts` → callback |
| User can create a channel profile | `api.test.ts` → "creates a channel with defaults, sources and rules" |
| AI can generate ideas | `pipeline.test.ts` → asserts distinct titles and non-zero scores |
| Ideas are scored | `unit.test.ts` → the §10 formula, weight normalisation, bounds |
| Research is generated | `pipeline.test.ts` → every finding has a claim, a source and a verdict |
| Script is generated | `pipeline.test.ts` → sections, hook, retention score |
| Script is fact checked | `pipeline.test.ts` → `factCheckScore` and `factConfidence` are set |
| Scenes are generated | `pipeline.test.ts` → every scene has a prompt and an asset |
| Visuals are generated | `pipeline.test.ts` → distinct assets, no silent reuse across scenes |
| Voice is generated | `pipeline.test.ts` → segments with word timings |
| Video is rendered | `pipeline.test.ts` → ffprobe: H.264 + AAC, duration matches the narration |
| Thumbnail is generated | `pipeline.test.ts` → variants produced, highest predicted CTR selected |
| SEO is generated | `pipeline.test.ts` → 10+ candidates, unique tags, description length |
| QC runs | `pipeline.test.ts` → report stored and passing; "refuses to publish when the upload safety checks fail" |
| Video can be scheduled | `pipeline.test.ts` → a real future slot; `integration.test.ts` → no double-booking |
| Video can be uploaded | `pipeline.test.ts` → "uploads, collects analytics and learns" |
| Analytics are collected | same test → snapshot with views and CTR |
| Costs are tracked | `integration.test.ts` → "meters every call, successful or not" |
| Failed jobs retry | `integration.test.ts` → queue retry and dead-letter; `pipeline.test.ts` → provider fallback |
| Autopilot works | `pipeline.test.ts` → weekly cap, buffer target, budget pause, manual mode |
| Multi-channel works | Every repository read is channel-scoped; `api.test.ts` → cross-tenant 404 |
| Dashboard displays real data | Playwright walkthrough of all 15 screens against the live API |

## What a future phase would add

The core does not need to change for any of these:

- **More platforms.** `PublishingProvider` is the port; `Channel.platform` selects the adapter.
  TikTok, Reels, X and podcast are new adapters plus a render preset.
- **A/B testing.** YouTube exposes no public title/thumbnail experiment API. When one exists it
  becomes a provider method; until then the honest option is controlled asset swaps within the
  documented API, which is what `updateMetadata` and `setThumbnail` already allow.
- **Per-user provider keys.** `ProviderCredential` already stores them encrypted; wiring them
  into the registry per request is a scoping change, not an architectural one.
- **Horizontal workers.** BullMQ already supports it; only `MAX_CONCURRENT_RENDERS` and storage
  need attention.
