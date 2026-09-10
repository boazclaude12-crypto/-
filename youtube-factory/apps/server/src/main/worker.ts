import 'dotenv/config';
import { buildServices, type AppServices } from '../services/container.js';
import { QUEUES } from '../queue/index.js';
import type { AdvancePayload } from '../pipeline/runner.js';
import { errorMessage } from '../shared/errors.js';
import { parseHhMm, toZonedParts } from '../shared/time.js';

/**
 * Worker entrypoint (spec §69). Consumes the pipeline queue and runs the periodic sweeps:
 * publishing due videos, refreshing analytics, the daily autopilot and the weekly strategy.
 */
async function main(): Promise<void> {
  const services = await buildServices();

  services.queue.register<AdvancePayload>(
    QUEUES.pipeline,
    (job) => services.runner.handle(job),
    services.config.queue.concurrency,
  );

  services.queue.register(QUEUES.maintenance, async (job) => {
    const action = job.name;
    if (action === 'publish-due') {
      const queued = await services.autopilot.publishDue();
      if (queued.length) services.logger.info('publish sweep', { queued: queued.length });
    } else if (action === 'autopilot') {
      const results = await services.autopilot.runAll();
      services.logger.info('autopilot sweep', {
        channels: results.length,
        started: results.reduce((n, r) => n + r.productionsStarted.length, 0),
      });
    } else if (action === 'analytics') {
      const videos = await services.repos.videos.listByStatus('PUBLISHED', 100);
      for (const video of videos) {
        await services.runner.enqueue(video.id, { reason: 'analytics sweep', expectStatus: 'PUBLISHED' });
      }
    } else if (action === 'strategy') {
      for (const channel of await services.repos.channels.listEnabled()) {
        await services.autopilot.runWeeklyStrategy(channel.id).catch((err) =>
          services.logger.warn('weekly strategy failed', { channelId: channel.id, error: errorMessage(err) }),
        );
      }
    }
  });

  await services.queue.start();

  // Periodic sweeps. Kept as intervals rather than an external cron so a single
  // `docker compose up` is a complete, self-driving deployment.
  const timers = [
    every(60_000, () => enqueueMaintenance(services, 'publish-due')),
    every(15 * 60_000, () => maybeRunAutopilot(services)),
    every(6 * 3600_000, () => enqueueMaintenance(services, 'analytics')),
    every(24 * 3600_000, () => enqueueMaintenance(services, 'strategy')),
  ];

  const shutdown = async (signal: string) => {
    services.logger.info('worker shutting down', { signal });
    for (const timer of timers) clearInterval(timer);
    await services.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  services.logger.info('worker started', {
    queue: services.queue.driver,
    concurrency: services.config.queue.concurrency,
    offline: services.config.offline,
  });
}

/** Runs the autopilot for channels whose configured local wake-up time has just passed. */
async function maybeRunAutopilot(services: AppServices): Promise<void> {
  const now = services.clock.now();
  for (const channel of await services.repos.channels.listEnabled()) {
    const settings = await services.repos.channelSettings.findByChannel(channel.id);
    if (!settings?.autopilotEnabled) continue;

    try {
      const { hour, minute } = parseHhMm(settings.autopilotRunAt);
      const local = toZonedParts(now, settings.timezone);
      const minutesSinceWake = (local.hour - hour) * 60 + (local.minute - minute);
      // Fire once inside the 15-minute window that follows the configured time.
      if (minutesSinceWake < 0 || minutesSinceWake >= 15) continue;

      const result = await services.autopilot.runForChannel(channel.id);
      services.logger.info('autopilot fired', {
        channelId: channel.id,
        started: result.productionsStarted.length,
        reason: result.reason,
      });
    } catch (err) {
      services.logger.warn('autopilot pass failed', { channelId: channel.id, error: errorMessage(err) });
    }
  }
}

async function enqueueMaintenance(services: AppServices, name: string): Promise<void> {
  await services.queue
    .enqueue(QUEUES.maintenance, name, { at: services.clock.now().toISOString() }, { maxAttempts: 1 })
    .catch((err) => services.logger.warn('maintenance enqueue failed', { name, error: errorMessage(err) }));
}

function every(ms: number, fn: () => void | Promise<void>): NodeJS.Timeout {
  const timer = setInterval(() => void fn(), ms);
  timer.unref?.();
  return timer;
}

main().catch((err) => {
  process.stderr.write(`Failed to start the worker: ${errorMessage(err)}\n`);
  process.exit(1);
});
