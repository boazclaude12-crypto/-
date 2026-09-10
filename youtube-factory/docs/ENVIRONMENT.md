# Environment

> Answers section 84.F. `.env.example` is the copy-paste version; this explains what each group
> is for and what happens when it is absent.

**Nothing is required to boot.** A provider without credentials reports `configured: false`,
the router never selects it, and the Providers screen names the exact variables to set. That is
the difference between a system that degrades and one that pretends (spec §81).

Variable names follow each vendor's own documentation. `HF_CREDENTIALS` is what the Higgsfield
SDK reads; `ELEVENLABS_API_KEY` is what ElevenLabs documents. They are not renamed for tidiness.

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
| Anthropic | `CLAUDE_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_FAST_MODEL` | Text and structured output fall to OpenAI. |
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

## Verifying

```bash
npm run factory --workspace @ycf/server -- doctor
```

Prints the environment, database, queue, storage and FFmpeg state, then every provider as
configured / not configured / unhealthy with the missing variables named. The Providers screen
shows the same thing in the dashboard.
