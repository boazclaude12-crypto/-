# Environment

> Answers section 84.F. `.env.example` is the copy-paste version; this explains what each group
> is for and what happens when it is absent.

**Nothing is required to boot.** A provider without credentials reports `configured: false`,
the router never selects it, and the Providers screen names the exact variables to set. That is
the difference between a system that degrades and one that pretends (spec §81).

Variable names follow each vendor's own documentation, read from that vendor's published SDK
rather than guessed (spec §74). `HF_CREDENTIALS` — a single `KEY_ID:KEY_SECRET` string — is what
the Higgsfield SDK reads; `ELEVENLABS_API_KEY` is what ElevenLabs documents;
`ANTHROPIC_API_KEY` is what Anthropic documents. They are not renamed for tidiness. Where a
second spelling is common it is accepted as an alias rather than substituted, so a key pasted
from either the vendor's docs or the spec works.

Adding a provider is only setting its variables: there is no code to change and no restart
ordering to get right. On the next call the registry sees `configured: true`, the router starts
selecting it by cost and health, and `factory doctor` flips it from "not configured" to
"configured". Until then the same pipeline runs through the mock, so nothing is blocked while
you wait for a key.

## Core

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `production` makes `ENCRYPTION_KEY` and `DATABASE_URL` mandatory. |
| `LOG_LEVEL` | `info` | Structured JSON logs; secret-shaped fields are redacted. |
| `PORT` / `HOST` | `4000` / `0.0.0.0` | |
| `PUBLIC_APP_URL` | `http://localhost:3000` | CORS origin and the base for links in notifications. |
| `PUBLIC_API_URL` | `http://localhost:4000` | Must use the **same hostname** as `PUBLIC_APP_URL`, or the session cookie is dropped as cross-site. |
| `OFFLINE_MODE` | `false` | Forces every provider to its mock. No network, no spend, full pipeline. |

## Data

| Variable | Notes |
|---|---|
| `DATABASE_URL` | PostgreSQL. Omit outside production to use in-memory repositories. |
| `REDIS_URL` | Enables BullMQ. Without it the queue falls back to the in-process implementation, which is complete but single-process. |

## Security

| Variable | Notes |
|---|---|
| `ENCRYPTION_KEY` | 32 bytes as 64 hex characters. Encrypts OAuth tokens and provider keys at rest. **Required in production.** `factory keygen` prints one. Losing it means reconnecting every channel. |
| `WEBHOOK_SECRET` | HMAC key for inbound webhooks and OAuth `state`. |
| `SESSION_COOKIE_NAME` / `SESSION_TTL_DAYS` | Defaults `ycf_session` / 30. |
| `ALLOW_REGISTRATION` | Set `false` after creating the accounts you want. |

## Storage

`STORAGE_DRIVER=local` writes under `STORAGE_LOCAL_DIR`. `s3` needs `S3_BUCKET`,
`S3_ACCESS_KEY` and `S3_SECRET_KEY`; `S3_ENDPOINT` and `S3_FORCE_PATH_STYLE` cover MinIO, R2 and
Spaces. `S3_PUBLIC_BASE_URL` is used when generating asset URLs for the dashboard.

## Providers

| Group | Variables | Without it |
|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` (Anthropic's documented name) or `CLAUDE_API_KEY`; `ANTHROPIC_MODEL`, `ANTHROPIC_FAST_MODEL` | Text and structured output fall to OpenAI. |
| OpenAI | `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_IMAGE_MODEL` | No text fallback; images fall to Higgsfield or the local generator. |
| Higgsfield | `HF_CREDENTIALS` (`KEY_ID:KEY_SECRET`) or `HF_API_KEY` + `HF_API_SECRET`; `HIGGSFIELD_VIDEO_MODEL`; optional `HIGGSFIELD_WEBHOOK_URL` | No generated video; scenes use image + camera motion. |
| ElevenLabs | `ELEVENLABS_API_KEY`, `ELEVENLABS_MODEL`, `ELEVENLABS_DEFAULT_VOICE_ID` | **No narration is possible** — this is the one capability with no free fallback outside offline mode. |
| YouTube | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REDIRECT_URI`, optional `YOUTUBE_API_KEY` | No channel connection, so no publishing. The API key is only needed for competitor lookups. |

At least one text provider and one voice provider are needed to produce a real video.

## Discovery and notifications

All optional. `NEWS_API_KEY`, `REDDIT_CLIENT_ID`/`SECRET`/`USER_AGENT` add sources;
Google Trends, Wikipedia and RSS need no credentials. `TELEGRAM_BOT_TOKEN` +
`TELEGRAM_WEBHOOK_SECRET`, `DISCORD_WEBHOOK_URL`, `SLACK_WEBHOOK_URL` and `SMTP_URL` each enable
one notification channel; an unconfigured channel is skipped rather than failing a delivery.

## Media and guardrails

`FFMPEG_PATH` / `FFPROBE_PATH` (must exist — rendering is not optional), `RENDER_WIDTH`,
`RENDER_HEIGHT`, `RENDER_FPS`, `RENDER_CRF`, `RENDER_PRESET`, `MEDIA_WORK_DIR`,
`MAX_CONCURRENT_RENDERS`, `DEFAULT_MONTHLY_BUDGET_USD`, `PROVIDER_TIMEOUT_MS`,
`PROVIDER_MAX_ATTEMPTS`.

`PRICING_OVERRIDES` carries JSON shaped like the rate card in `providers/rates.ts`, deep-merged
over it at startup, so a price the vendor changed is a config edit rather than a fork:

```bash
PRICING_OVERRIDES='{"higgsfield":{"videoPerSecond":{"standard":0.15}}}'
```

Overriding one tier leaves the others alone, and an unknown provider is added rather than
rejected. Malformed JSON throws at startup on purpose — an override you believe applied but
which was silently dropped is worse than no override, because the budget guard would keep
spending against the old number.

## Connecting Higgsfield

What the adapter needs from you is small and exact:

```bash
HF_CREDENTIALS=KEY_ID:KEY_SECRET       # one string, colon-separated
# or, equivalently:
HF_API_KEY=...
HF_API_SECRET=...

HIGGSFIELD_BASE_URL=https://platform.higgsfield.ai
HIGGSFIELD_VIDEO_MODEL=dop-turbo       # dop-lite | dop-turbo | dop-standard
HIGGSFIELD_WEBHOOK_URL=                # optional; polling is used when unset
```

Two credentials, not one — a key **id** and a key **secret**, sent as
`Authorization: Key <KEY_ID>:<KEY_SECRET>`. That is what their SDK does, and it is what the
contract tests in `providers.test.ts` pin.

### What it will and will not do

**There is no text-to-video endpoint in this API.** Text→video is composed as
`POST /v1/text2image/soul` followed by `POST /v1/image2video/dop` — the same path the vendor's
own SDK takes. The adapter refuses a video request with no first frame rather than pretending
an endpoint exists, and a test asserts that refusal. If you were expecting to hand it a prompt
and get footage in one call, that is not a gap in this code.

Video generation is also **optional**. Without Higgsfield the pipeline still produces video:
scenes fall back to a generated still plus camera motion through the local FFmpeg generator.
You are buying better motion, not the ability to make a video at all.

### Before you pay for it

I could not reach `higgsfield.ai`, `docs.higgsfield.ai` or `platform.higgsfield.ai` from the
environment this was built in — every one of them was blocked by egress policy. So:

- **The adapter is written against their published SDK contract**, which I did read, and every
  request it makes is pinned by a contract test. That part is solid.
- **I have never seen their pricing page, their plan tiers, or whether API access requires a
  particular subscription.** Nothing in this repository should be read as a claim about any of
  those. Check on their site before subscribing, and specifically check that the plan you pick
  includes **API access with a key id and secret** — a plan that only unlocks the web app would
  be useless here.
- **The Higgsfield rates in `providers/rates.ts` are placeholders, not quotes** — marked
  `UNVERIFIED` in the file. Correct them from your first invoice with `PRICING_OVERRIDES`
  (below). Until you do, cost estimates and the budget guard are running on a guess.

The honest test is cheap: subscribe to whatever tier gives API credentials, put them in `.env`,
and run

```bash
npm run factory --workspace @ycf/server -- doctor
```

It flips `higgsfield` from `not configured` to `ok` (or `unhealthy`, with the vendor's own
error text) without spending anything on a generation.

## Test-only variables

None of these are read by the running system — they exist so a test suite can attach to a real
service instead of skipping. All optional.

| Variable | Effect when set |
|---|---|
| `TEST_DATABASE_URL` | Re-runs the repository suite against PostgreSQL, asserting the Prisma adapter matches the in-memory one |
| `TEST_REDIS_URL` | Re-runs the queue suite against BullMQ |
| `TEST_S3_ENDPOINT` | Points the storage suite at a real S3/MinIO instead of the in-process S3 server. `TEST_S3_BUCKET`, `TEST_S3_REGION`, `TEST_S3_ACCESS_KEY` and `TEST_S3_SECRET_KEY` go with it |

`npm run test:services` sets the first two to the `docker compose` defaults.

## Verifying

```bash
npm run factory --workspace @ycf/server -- doctor
```

Prints the environment, database, queue, storage and FFmpeg state, then every provider as
configured / not configured / unhealthy with the missing variables named. The Providers screen
shows the same thing in the dashboard.
