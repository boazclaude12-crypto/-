# HTTP API

> Answers section 84.D of the specification. Every route is JSON in / JSON out, authenticated
> by an opaque session cookie, validated with zod, and scoped to the caller's channels.

## Conventions

- **Base URL** — `PUBLIC_API_URL` (default `http://localhost:4000`).
- **Auth** — `HttpOnly; SameSite=Lax` cookie issued by `POST /api/auth/login`. Send
  `credentials: 'include'`.
- **Errors** — always `{ "error": { "code", "message", "details"? } }` with a meaningful status.
  `validation_error` 400 · `unauthorized` 401 · `forbidden` 403 · `not_found` 404 ·
  `conflict` 409 · `budget_exceeded` 402 · `rate_limited` 429 · `provider_not_configured` 503.
- **Tenant isolation** — a channel or video belonging to another user returns **404**, never 403:
  existence is not disclosed.
- **Nothing blocks** — routes that start work create a `Job` and return its id. The HTTP process
  never runs a pipeline step (spec §69).
- **Rate limits** — 300/min per IP globally; 10/min on the credential endpoints
  (`login`, `register`, `password`); 20/min on the endpoints that start paid generation.
  `/api/auth/me` is deliberately *not* on the strict limit — every page load calls it.

## Auth

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/auth/register` | First account on an instance becomes `ADMIN`. Seeds prompts and templates. |
| `POST` | `/api/auth/login` | Wrong password and unknown account are indistinguishable, by design. |
| `POST` | `/api/auth/logout` | Revokes the session server-side. |
| `GET` | `/api/auth/me` | Current user plus their channels. |
| `POST` | `/api/auth/password` | Changing the password revokes every other session. |

## Channels

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/channels` | With settings and connection state. |
| `POST` | `/api/channels` | Creates the channel, its default discovery sources and its default automation rules. |
| `GET` | `/api/channels/:id` | Settings, competitors, sources, rules, upcoming slots, budget. |
| `PATCH` | `/api/channels/:id` | Partial settings update. |
| `DELETE` | `/api/channels/:id` | Cascades. |
| `POST` | `/api/channels/:id/connect` | Returns a Google authorize URL with a signed, expiring `state`. |
| `GET` | `/api/channels/oauth/callback` | Verifies `state`, exchanges the code, stores AES-256-GCM ciphertext, redirects to the dashboard. |
| `POST` | `/api/channels/:id/disconnect` | Revokes upstream where possible, then deletes local tokens. |
| `GET` | `/api/channels/:id/schedule` | The next publishing instants, and which are taken. |
| `GET`/`POST`/`DELETE` | `/api/channels/:id/competitors[/:competitorId]` | Competitor tracking. |
| `POST`/`DELETE` | `/api/channels/:id/sources[/:sourceId]` | Discovery sources. |
| `POST` | `/api/channels/:id/discover` | Crawl now; returns the merged signals. |
| `POST`/`DELETE` | `/api/channels/:id/rules[/:ruleId]` | Automation rules. |
| `POST` | `/api/channels/:id/autopilot` | `{ enabled }`. Refuses until the channel is connected. |
| `POST` | `/api/channels/:id/autopilot/run` | One pass now. |
| `POST` | `/api/channels/:id/generate-video` | One-click production (spec §61). |

## Ideas

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/ideas?channelId&status&limit` | Ranked by overall score. |
| `POST` | `/api/ideas/generate` | Crawl → agent → score. 409 when the budget is exhausted. |
| `PATCH` | `/api/ideas/:id` | Editing re-derives the overall score. |
| `POST` | `/api/ideas/:id/approve` · `/reject` | |
| `POST` | `/api/ideas/:id/produce` | Creates the video and enqueues the first step. |

## Videos

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/videos?channelId&status&limit&offset` | `status` accepts a comma-separated list. |
| `GET` | `/api/videos/:id` | Everything the video page needs: research, script, scenes, assets, voiceovers, thumbnails, SEO, QC, upload, analytics, decisions, jobs, agent runs, timeline, render command. |
| `POST` | `/api/videos/:id/advance` | Enqueue the next step. |
| `POST` | `/api/videos/:id/approve` · `/reject` | Approval gate (spec §47). |
| `POST` | `/api/videos/:id/retry` | Resumes from the stage that failed, or an explicit one. |
| `POST` | `/api/videos/:id/qc` | Re-run quality control. |
| `POST` | `/api/videos/:id/schedule` | Next free slot, or an explicit future `publishAt`. Refuses if QC has not passed. |
| `POST` | `/api/videos/:id/upload` | Enqueue the upload. Refuses unless the video is `SCHEDULED`. |
| `POST` | `/api/videos/:id/thumbnail` | Choose a variant. |
| `PATCH` | `/api/videos/:id/seo` | Override title, description or tags. |
| `DELETE` | `/api/videos/:id` | |

## Research, scripts, calendar

| Method | Path |
|---|---|
| `GET` | `/api/research/:videoId` |
| `POST` | `/api/research/:videoId/run` |
| `GET` | `/api/scripts/:videoId` |
| `POST` | `/api/scripts/generate` |
| `GET` | `/api/calendar?channelId&from&to` |
| `PATCH` | `/api/calendar/:videoId` — drag-and-drop rescheduling |

## Insight

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/overview?channelId` | The dashboard payload (spec §6). |
| `GET` | `/api/analytics?channelId&days` | Per-video metrics, channel baseline, learnings, latest strategy. |
| `POST` | `/api/analytics/:videoId/collect` | Refresh one video's metrics. |
| `POST` | `/api/analytics/:channelId/strategy` | Run the weekly strategist. |
| `GET` | `/api/costs?channelId` | Month total, by provider, per channel budget, per video, recent calls. |
| `GET` | `/api/providers` | Configuration and health, with the exact missing variables. |

## Prompts, templates, notifications, admin

| Method | Path |
|---|---|
| `GET` | `/api/prompts` · `/api/prompts/:name` |
| `POST` | `/api/prompts/:name/versions` · `/api/prompts/versions/:id/activate` |
| `GET`/`POST`/`DELETE` | `/api/templates[/:id]` |
| `GET`/`POST`/`DELETE` | `/api/notifications/targets[/:id]` |
| `GET` | `/api/admin/stats` · `/api/admin/users` (ADMIN only) |

## Webhooks

CSRF-exempt — each authenticates itself.

| Method | Path | Authentication |
|---|---|---|
| `POST` | `/api/webhooks/higgsfield` | Signed token in the callback URL we supplied, 24h window. |
| `POST` | `/api/webhooks/trigger` | `x-ycf-timestamp` + `x-ycf-signature` = HMAC-SHA256 over `timestamp.body`, 5-minute window. Actions: `autopilot`, `publish-due`, `analytics`, `strategy`. |
| `POST` | `/api/webhooks/telegram` | `x-telegram-bot-api-secret-token`, compared in constant time. |

Signing a trigger call:

```bash
BODY='{"action":"publish-due"}'
TS=$(date +%s)
SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -r | cut -d' ' -f1)
curl -X POST "$PUBLIC_API_URL/api/webhooks/trigger" \
  -H "content-type: application/json" \
  -H "x-ycf-timestamp: $TS" -H "x-ycf-signature: $SIG" \
  -d "$BODY"
```

## Unauthenticated

| Method | Path |
|---|---|
| `GET` | `/api/health` |
| `GET` | `/api/meta` — pipeline stages, offline flag, whether registration is open |
