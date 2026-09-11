# Deployment

> How to run the factory so it produces and publishes on its own, and — just as
> importantly — what still needs you. "Passive" is a claim worth being precise about.

## The shape of it

It is a web application plus a background worker. Three processes of ours, three services:

| Process | Port | Needs a domain | What it does |
|---|---|---|---|
| `web` | 3000 | **yes** — this is the site you open | The dashboard |
| `api` | 4000 | **yes** — the browser calls it, and Google redirects OAuth back to it | REST API; every request returns in milliseconds |
| `worker` | — | no | **The one that makes it autonomous.** Runs the pipeline and the periodic sweeps |
| postgres · redis · minio | — | no | Data, queue, media |

The worker is the answer to your question. It holds four timers:

| Sweep | Interval |
|---|---|
| publish anything whose slot has arrived | 1 min |
| autopilot — discover, score, start productions | 15 min |
| refresh analytics for published videos | 6 h |
| weekly strategy per channel | 24 h |

They are plain intervals inside the worker rather than an external cron, so `docker compose
up -d` is a complete self-driving deployment. Nothing else has to be scheduled.

## Where it can run

**A normal VPS.** Hetzner, DigitalOcean, Contabo, a Hetzner dedicated box — anything where you
get a shell and Docker. Four cores and 8 GB is a sensible floor.

**Not Vercel, Netlify, Cloudflare Pages or any serverless host.** Two reasons, both hard:
rendering is minutes of pinned CPU inside a request-less process, and the worker has to stay
resident to hold its timers. Serverless platforms kill both. The dashboard alone could live
there, but then you are splitting the deployment for no gain.

### Sizing, from a measured render

One real figure rather than a guess: on 4 cores, a 93-second 1080p video took **35 seconds to
render and came out at 37 MB**, at `RENDER_CRF=20` and `RENDER_PRESET=medium`.

Scaling that roughly linearly:

| A 10-minute video | ≈ |
|---|---|
| render time | 4 minutes of one core |
| final MP4 | 240 MB |
| plus intermediates (per-scene clips, narration, thumbnails) | roughly the same again |

At three videos a week that is about **3 GB a month** of finished video, more if you keep the
intermediates. Put object storage on S3, R2 or Spaces rather than the box's disk — the compose
file ships MinIO for local use, but `S3_ENDPOINT` points anywhere.

`MAX_CONCURRENT_RENDERS=1` is the default and it is the right one on a small box: two
simultaneous FFmpeg renders on four cores are slower than two in sequence.

## Domains

Use two subdomains of **one** domain:

```
factory.example.com       → web  (:3000)
api.factory.example.com   → api  (:4000)
```

Put Caddy or nginx in front for TLS. Caddy is two lines and gets certificates itself:

```caddy
factory.example.com      { reverse_proxy localhost:3000 }
api.factory.example.com  { reverse_proxy localhost:4000 }
```

Then in `.env`:

```bash
NODE_ENV=production
PUBLIC_APP_URL=https://factory.example.com
PUBLIC_API_URL=https://api.factory.example.com
YOUTUBE_REDIRECT_URI=https://api.factory.example.com/api/channels/oauth/callback
```

> **Both must sit under the same registrable domain, over https.** The session cookie is
> `SameSite=Lax`; a browser decides same-site by registrable domain and scheme, so
> `factory.example.com` and `api.factory.example.com` are the same site and the cookie flows,
> while `myfactory.com` and `factory-api.net` are not and you will be silently logged out on
> every request. `localhost` and `127.0.0.1` are likewise different sites.
>
> In production CORS trusts exactly `PUBLIC_APP_URL` and nothing else.

`YOUTUBE_REDIRECT_URI` has to be byte-identical to the redirect URI registered in the Google
Cloud console, trailing slash included, or the OAuth exchange fails.

## Bringing it up

```bash
git clone <your fork> && cd youtube-factory
cp .env.example .env
npm run factory --workspace @ycf/server -- keygen      # paste into ENCRYPTION_KEY
# fill in the provider keys, PUBLIC_* URLs and YOUTUBE_REDIRECT_URI
docker compose up -d --build
docker compose run --rm api node dist/cli/index.js doctor
```

`compose` runs `prisma migrate deploy` before the API starts. `doctor` tells you what is
configured and what is missing; anything unconfigured is routed around, never faked.

Then open the dashboard, create the first account (it becomes `ADMIN`), set
`ALLOW_REGISTRATION=false`, create a channel, connect it to YouTube, and set the channel to
**`FULL_AUTO`**.

## What actually runs without you

Once the above is done and the channel is `FULL_AUTO`, the loop closes: trends → ideas →
research → script → fact check → scenes → visuals → narration → render → QC → thumbnail →
SEO → schedule → upload → analytics → learning → next week's strategy. No input from you.

## What still needs you — honestly

Nobody should deploy this believing it is zero-touch. Five things are not:

1. **Money.** Every video costs real API spend. The budget guard pauses non-essential
   generation when `monthlyBudgetUsd` is exhausted, so the failure mode is "it stops", not "it
   overspends" — but somebody has to top up the provider accounts.
2. **`FULL_AUTO` is a deliberate choice.** The demo channel ships as `SEMI_AUTO`, which stops
   before scheduling and waits for you. That is the default on purpose; nothing publishes
   itself until you change it.
3. **Quality gates can hold a video back, and should.** A video below the channel's
   `minQcScore`, `minFactConfidence` or `minRetentionScore` will not publish automatically.
   That is the system working. It also means the buffer can quietly run dry if a prompt or a
   provider starts producing weak output — watch the dashboard's buffer, or wire up a
   notification target so it tells you.
4. **OAuth can be revoked.** The pipeline refreshes tokens on its own while a refresh token
   is valid. If Google revokes it — a password change, a security review, six months of
   inactivity — the channel needs reconnecting by hand. The error says exactly that.
5. **YouTube's own limits.** Quota is respected by backing off, never worked around. Uploads
   are the expensive call against the Data API's daily quota, so a few videos a day is the
   realistic ceiling on a default project.

### Check this before you count on it

**A Google Cloud project using the YouTube upload scope generally has to pass Google's API
compliance audit before uploads from it can be public; until then they can be restricted to
private.** I could not reach `developers.google.com` from the environment I built this in, so
treat that as something to verify yourself rather than as a verified fact from me — but verify
it *before* you plan a passive channel around it, because if it holds, it is the single thing
standing between "deployed" and "publishing publicly on its own". Check the current terms and
the audit process in the Google Cloud console for your own project.

Everything on our side of that line is done: the adapter implements the documented resumable
upload protocol, sets `publishAt` and `selfDeclaredMadeForKids`, and backs off on
`quotaExceeded`. What Google permits your project to do with it is between you and Google.

## Staying up

- `docker compose up -d` restarts containers on reboot (`restart: unless-stopped` is worth
  adding to `api`, `worker` and `web` for production).
- **Back up PostgreSQL** — everything except media lives there. And keep `ENCRYPTION_KEY`
  somewhere other than the box: lose it and every stored OAuth token is unreadable and every
  channel has to be reconnected.
- Set a notification target (Telegram, Discord, Slack) for `UPLOAD_FAILED` and `QC_FAILED`.
  A passive system you never hear from is indistinguishable from a stopped one.
