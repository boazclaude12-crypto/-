# Runbook

## First run

```bash
cd youtube-factory && npm install
npm run factory --workspace @ycf/server -- keygen        # ENCRYPTION_KEY
cp .env.example .env                                     # paste it in
npm run factory --workspace @ycf/server -- doctor        # what is configured, what is missing
docker compose up --build
```

`compose` brings up postgres, redis and minio, runs `prisma migrate deploy` as a one-shot
`migrate` service, and only then starts the API, the worker and the dashboard. Running
outside compose, apply migrations yourself first:

```bash
npm run prisma:migrate --workspace @ycf/server
```

Open `http://localhost:3000`, create the first account (it becomes `ADMIN`), create a channel,
connect it to YouTube, then turn on Autopilot.

## Verifying a deployment

```bash
npm test                    # 200 tests — no services, no credentials, no network
npm run test:services       # 229 — adds PostgreSQL and Redis (see README for the URLs)
npm run factory --workspace @ycf/server -- doctor
```

`npm test` is the gate for a change. `test:services` is the gate for a release: it re-runs the
repository suite against PostgreSQL and the queue suite against real BullMQ, which is where
adapter drift shows up — a Prisma `create` that silently drops a column, an ordering that is
only stable in memory, a counter that overflows 32 bits.

After a deploy, `doctor` is the one command that answers "is this instance actually able to
produce a video": it prints the database, queue, storage and FFmpeg state, then every provider
as configured / not configured / unhealthy with the missing variables named.

## Daily operation

The worker drives itself:

| Sweep | Interval | What it does |
|---|---|---|
| publish-due | 1 min | Uploads videos whose slot has arrived |
| autopilot | 15 min | Runs the channels whose local wake-up time has just passed |
| analytics | 6 h | Refreshes metrics for published videos |
| strategy | 24 h | Weekly plan per channel |

To drive it externally instead, call `POST /api/webhooks/trigger` with a signed body (see
`docs/API.md`) from cron, a Cloud Scheduler job, or a GitHub Action.

## Diagnosing

| Symptom | Where to look |
|---|---|
| A video is stuck | Video page → **Logs** tab: jobs with attempt counts and the exact error |
| Something looks wrong | Video page → **Overview**: every decision with the numbers behind it |
| "No configured provider supports X" | Providers screen names the exact missing variables |
| A render failed | Video page → **Timeline** tab has the full FFmpeg command; run it by hand |
| Spend looks high | Costs screen → by provider, per video, per minute, and the last 50 calls |
| Nothing is being produced | Dashboard → buffer; autopilot only starts work when the buffer is short and the weekly cap allows it |

## Common situations

**Budget exhausted.** Non-essential generation pauses; QC, upload and analytics still run so
work already paid for finishes. Raise `monthlyBudgetUsd` on the channel, or wait for the month
to roll over.

**A provider goes down.** Five failures in a minute opens its circuit breaker and the router
moves to the next provider. Visual generation ultimately falls back to the local FFmpeg
generator, so a scene always gets *something* rather than failing the video.

**QC keeps failing.** The report names the failed check and the stage to re-run. After three
attempts the video is marked `FAILED` rather than looping. Retry from the video page once the
cause is addressed.

**OAuth expired.** The pipeline refreshes automatically while a refresh token exists. If it was
revoked upstream, reconnect the channel — the error message says exactly that.

**Session cookie not sticking.** `PUBLIC_APP_URL` and `NEXT_PUBLIC_API_URL` must use the same
hostname. `localhost` and `127.0.0.1` are different sites to a browser, and a `SameSite=Lax`
cookie set by one will not be sent to the other.

## Backup

- **PostgreSQL** — everything except media. `pg_dump` on the usual schedule.
- **Object storage** — renders, visuals, narration, thumbnails, captions, under
  `channels/{channelId}/videos/{videoId}/…`.
- **`ENCRYPTION_KEY`** — losing it makes every stored OAuth token unreadable and every channel
  has to be reconnected. Keep it in a secret manager, not in the repository.

## Upgrading

```bash
git pull
npm install
npm run prisma:migrate --workspace @ycf/server
docker compose up --build -d
```

Prompts are data, not code: `factory seed` only creates prompts that are missing, so a
deploy never overwrites a version you have edited.
