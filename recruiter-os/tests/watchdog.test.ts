import './setup';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startWatchdog, recordSync, watchdogReport, buildInfo } from '../src/lib/watchdog';

/** Blocks the event loop for real, the way a long synchronous query does. */
function blockFor(ms: number): void {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    /* deliberately spinning */
  }
}

describe('watchdog', () => {
  test('notices when the event loop was blocked', async () => {
    startWatchdog();
    blockFor(1_500);
    // Let the monitor's timer fire now that the loop is free again.
    await new Promise((resolve) => setTimeout(resolve, 900));

    const report = watchdogReport();
    assert.ok(report.running, 'the monitor is running');
    // Sampling hides up to one 500ms interval of any stall, so a 1.5s block is
    // guaranteed to surface as at least a second — not as the full 1.5.
    assert.ok(
      report.maxLagMs >= 900,
      `a 1.5s block should be recorded as roughly a second of lag, saw ${report.maxLagMs}ms`,
    );
    assert.ok(report.recentStalls.length >= 1, 'the stall is listed');
    assert.ok(report.worstRecentStallMs >= 900);
  });

  test('a healthy loop records no stall', async () => {
    startWatchdog();
    const before = watchdogReport().recentStalls.length;
    // Idle time is not a stall: the loop is free, it simply has nothing to do.
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    assert.equal(watchdogReport().recentStalls.length, before);
  });

  test('starting twice does not start a second monitor', () => {
    startWatchdog();
    startWatchdog();
    assert.ok(watchdogReport().running);
  });

  test('reports uptime from boot', () => {
    assert.ok(watchdogReport().uptimeSeconds >= 0);
  });

  test('remembers the last background sync, success or failure', () => {
    recordSync(false, 'החיבור לתיבה נדחה');
    const failed = watchdogReport().lastSync;
    assert.equal(failed?.ok, false);
    assert.match(failed?.detail ?? '', /נדחה/);

    recordSync(true, 'נבדקו 2 תיבות, נקלטו 5');
    const ok = watchdogReport().lastSync;
    assert.equal(ok?.ok, true);
    assert.match(ok?.detail ?? '', /נקלטו 5/);
  });

  test('always answers which build is running', () => {
    const build = buildInfo();
    // Every field has a value even outside a container, so the page never renders blanks.
    for (const value of Object.values(build)) {
      assert.equal(typeof value, 'string');
      assert.ok(value.length > 0);
    }
  });

  test('prefers the host-injected commit when there is one', () => {
    const previous = process.env.RAILWAY_GIT_COMMIT_SHA;
    process.env.RAILWAY_GIT_COMMIT_SHA = 'abcdef1234567890';
    try {
      assert.equal(buildInfo().commit, 'abcdef1');
    } finally {
      if (previous === undefined) delete process.env.RAILWAY_GIT_COMMIT_SHA;
      else process.env.RAILWAY_GIT_COMMIT_SHA = previous;
    }
  });
});
