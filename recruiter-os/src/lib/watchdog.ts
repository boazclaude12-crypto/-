import fs from 'node:fs';
import path from 'node:path';

/**
 * What the server knows about its own health.
 *
 * The app runs as a single Node process with a synchronous SQLite driver, which means
 * anything that blocks — a long query, parsing a stack of CVs, a stalled write to a
 * network-backed volume — blocks every other request at the same time. From a browser
 * that is indistinguishable from a dead server or a bad network: the page simply never
 * arrives. The process itself can tell the difference, so it measures and remembers.
 */

const bootedAt = Date.now();

/** How often the loop is sampled. Short enough to catch a stall, cheap enough to leave on. */
const SAMPLE_MS = 500;
/** A stall longer than this is worth remembering — a page render is milliseconds. */
const STALL_MS = 250;

type Stall = { at: number; ms: number };

const state = {
  started: false,
  maxLagMs: 0,
  lastLagMs: 0,
  stalls: [] as Stall[],
  lastSync: null as { at: number; ok: boolean; detail: string } | null,
};

/**
 * Starts the event-loop lag monitor.
 *
 * A timer set for 500ms that fires after 4 seconds spent 3.5 of them unable to run, and
 * nothing else in the process could have run either. That drift is the measurement; there
 * is nothing to instrument and no cost to carrying it.
 *
 * Sampling means a stall is under-reported by up to one interval: whatever of it passed
 * before the next tick was due is invisible. That is fine for what this is for — the
 * stalls worth finding last seconds, and one that hides entirely inside a 500ms window
 * was never the reason a page appeared to hang.
 */
export function startWatchdog(): void {
  if (state.started) return;
  state.started = true;

  let expected = Date.now() + SAMPLE_MS;
  const tick = () => {
    const now = Date.now();
    const lag = Math.max(0, now - expected);
    state.lastLagMs = lag;
    if (lag > state.maxLagMs) state.maxLagMs = lag;
    if (lag >= STALL_MS) {
      state.stalls.push({ at: now, ms: lag });
      // Only the recent ones matter; an unbounded list would itself become a leak.
      if (state.stalls.length > 20) state.stalls.shift();
    }
    expected = now + SAMPLE_MS;
    // unref so a shutdown is never held open by the monitor.
    setTimeout(tick, SAMPLE_MS).unref();
  };
  setTimeout(tick, SAMPLE_MS).unref();
}

/** Called by the background mailbox sync so its last outcome is visible without the log. */
export function recordSync(ok: boolean, detail: string): void {
  state.lastSync = { at: Date.now(), ok, detail };
}

/**
 * Which build is actually running.
 *
 * Repeatedly through this project a "broken site" turned out to be a host that had
 * quietly stopped deploying, with the fix already pushed and never built. Nobody can
 * see that from the outside, so the running process states it: the commit it was built
 * from, and when. Railway injects the git fields; BUILD_ID is Next's own per-build
 * identifier and works anywhere, so there is always an answer.
 */
export function buildInfo(): { commit: string; branch: string; builtAt: string; buildId: string } {
  let buildId = 'לא ידוע';
  let builtAt = 'לא ידוע';
  try {
    const file = path.join(process.cwd(), '.next', 'BUILD_ID');
    buildId = fs.readFileSync(file, 'utf8').trim();
    builtAt = new Date(fs.statSync(file).mtime).toISOString();
  } catch {
    /* running from source, or the build moved */
  }
  const commit = process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? '';
  return {
    commit: commit ? commit.slice(0, 7) : 'לא ידוע',
    branch: process.env.RAILWAY_GIT_BRANCH ?? process.env.GIT_BRANCH ?? 'לא ידוע',
    builtAt,
    buildId,
  };
}

export function watchdogReport() {
  const now = Date.now();
  const recent = state.stalls.filter((stall) => now - stall.at < 15 * 60_000);
  return {
    uptimeSeconds: Math.round((now - bootedAt) / 1000),
    bootedAt: new Date(bootedAt).toISOString(),
    running: state.started,
    lastLagMs: state.lastLagMs,
    maxLagMs: state.maxLagMs,
    recentStalls: recent.map((stall) => ({ at: new Date(stall.at).toISOString(), ms: stall.ms })),
    worstRecentStallMs: recent.reduce((worst, stall) => Math.max(worst, stall.ms), 0),
    lastSync: state.lastSync
      ? { at: new Date(state.lastSync.at).toISOString(), ok: state.lastSync.ok, detail: state.lastSync.detail }
      : null,
  };
}
