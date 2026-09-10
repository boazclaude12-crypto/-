# YouTube Content Factory

A multi-tenant system that runs YouTube channels close to autonomously. Connect a channel,
describe the niche, audience, cadence and budget, and turn on Autopilot. From there the
factory discovers topics, scores ideas, researches them against citable sources, writes and
fact-checks a script, plans scenes, generates visuals and narration, renders an MP4 with
FFmpeg, produces a thumbnail and SEO metadata, runs quality control, schedules the upload,
publishes through the YouTube Data API, collects analytics, and feeds what it learns into the
next idea.

Two properties shape everything here:

- **No faked integrations.** Every vendor adapter is written against that vendor's real,
  published API contract. A provider with no credentials reports `configured: false` and the
  router simply never selects it — the system degrades instead of pretending.
- **The whole pipeline runs with no money and no network.** Mock providers implement the same
  ports as the real ones, so `IDEA → SCHEDULED` executes in CI and produces a genuine,
  playable MP4 through FFmpeg. That is what the acceptance test asserts on.

---

## Quick start

### Offline — the entire factory, no credentials

```bash
cd youtube-factory
npm install
export OFFLINE_MODE=true

# Create a user and a fully configured channel
npm run factory --workspace @ycf/server -- demo --niche "European history"

# Generate and score ideas, then produce one end to end
npm run factory --workspace @ycf/server -- ideas <channelId>
npm run factory --workspace @ycf/server -- produce <ideaId>
```

The last command runs the real pipeline — research, script, fact check, scenes, visuals,
narration, FFmpeg render, QC, thumbnail, SEO, scheduling — and leaves a playable MP4 under
`.storage/channels/<channelId>/videos/<videoId>/renders/final.mp4`.

FFmpeg must be on `PATH`; `factory doctor` tells you what is missing.

### With real providers

```bash
cp .env.example .env
npm run factory --workspace @ycf/server -- keygen   # → ENCRYPTION_KEY
# fill in the provider keys you have, then:
npm run factory --workspace @ycf/server -- doctor
```

`doctor` reports every provider as configured / not configured / unhealthy and names the exact
environment variables that are missing. Anything unconfigured is routed around, not faked.

### Full stack

```bash
docker compose up --build      # postgres, redis, minio, api, worker, dashboard
```

Or run the three processes directly:

```bash
npm run dev --workspace @ycf/server           # API on :4000
npm run dev:worker --workspace @ycf/server    # queue worker
npm run dev:web                               # dashboard on :3000
```

> `PUBLIC_APP_URL` and `NEXT_PUBLIC_API_URL` must use the same hostname. Mixing `localhost`
> and `127.0.0.1` between them makes the two different sites, and the browser will drop the
> session cookie.

---

## What is in here

```
youtube-factory/
├── docs/                    ARCHITECTURE · DATABASE · API · AGENTS · ENVIRONMENT · ROADMAP · RUNBOOK
├── docker-compose.yml       postgres · redis · minio · api · worker · web
└── apps/
    ├── server/              domain, providers, agents, pipeline, media, HTTP, CLI, tests
    └── web/                 Next.js dashboard
```

Read `docs/ARCHITECTURE.md` first — it covers the layering, the provider abstraction, the
agent contract, the queue model and the security model, and it names the exact vendor
endpoints each adapter targets.

## Commands

| Command | What it does |
|---|---|
| `factory demo` | Create a user and a fully configured channel |
| `factory doctor` | Provider, storage, queue and FFmpeg health |
| `factory ideas <channelId>` | Generate and score ideas |
| `factory produce <ideaId>` | Start production and run it to completion |
| `factory run <videoId>` | Advance one video as far as it will go |
| `factory status <videoId>` | Stage-by-stage progress |
| `factory autopilot [channelId]` | One autopilot pass |
| `factory publish-due` | Publish everything whose slot has arrived |
| `factory seed` | Write prompts, templates and the music library |
| `factory keygen` | Print a fresh `ENCRYPTION_KEY` |

Run them as `npm run factory --workspace @ycf/server -- <command>`.

## Tests

```bash
npm test        # 119 tests: unit, integration, API and full-pipeline acceptance
```

The acceptance tests execute the whole factory against mock providers and a real FFmpeg, then
assert on the artefacts: a decodable H.264/AAC file whose length matches the narration, SRT
cues with real timings, three thumbnail variants with one selected, ten-plus scored title
candidates, chapters derived from word timings, a passing QC report, and a reserved
publishing slot. Nothing is asserted by "no exception was thrown".

## What it will not do

It does not evade rate limits, copyright detection, authentication or any platform control.
It does not rewrite someone else's video: it researches sources and writes from them, and the
QC stage blocks a script that overlaps too closely with any one source. A claim with no source
is marked `UNVERIFIED` and may not be stated as fact, and a video whose fact confidence sits
below the channel's threshold cannot publish automatically.
