#!/usr/bin/env node
import 'dotenv/config';
import { buildServices, type AppServices } from '../services/container.js';
import { seedDemoChannel, seedSystem } from './seed.js';
import { errorMessage } from '../shared/errors.js';
import { AesGcmEncryptor } from '../shared/crypto.js';
import { PIPELINE_STAGES } from '../pipeline/state-machine.js';

/**
 * `factory` — the operator CLI.
 *
 *   factory quickstart [--niche …]    demo + ideas + produce, in one process
 *   factory seed                      write prompts, templates and the music library
 *   factory demo [--niche …]          create a demo user + channel and seed everything
 *   factory doctor                    report provider, storage, queue and FFmpeg health
 *   factory ideas <channelId>         generate and score ideas for a channel
 *   factory produce <ideaId>          start production and run it to completion
 *   factory run <videoId>             advance one video as far as it will go
 *   factory autopilot [channelId]     one autopilot pass
 *   factory publish-due               publish everything whose slot has arrived
 *   factory status <videoId>          show the pipeline position of one video
 *   factory keygen                    print a fresh ENCRYPTION_KEY
 */
async function main(): Promise<number> {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === 'help' || command === '--help') {
    printUsage();
    return 0;
  }
  if (command === 'keygen') {
    process.stdout.write(`${AesGcmEncryptor.generateKey()}\n`);
    return 0;
  }

  const services = await buildServices();
  try {
    switch (command) {
      case 'seed':
        return await cmdSeed(services);
      case 'demo':
        return await cmdDemo(services, args);
      case 'quickstart':
        return await cmdQuickstart(services, args);
      case 'doctor':
        return await cmdDoctor(services);
      case 'ideas':
        return await cmdIdeas(services, args);
      case 'produce':
        return await cmdProduce(services, args);
      case 'run':
        return await cmdRun(services, args);
      case 'autopilot':
        return await cmdAutopilot(services, args);
      case 'publish-due':
        return await cmdPublishDue(services);
      case 'status':
        return await cmdStatus(services, args);
      default:
        process.stderr.write(`Unknown command "${command}".\n\n`);
        printUsage();
        return 1;
    }
  } finally {
    await services.close();
  }
}

async function cmdSeed(services: AppServices): Promise<number> {
  const users = await services.repos.users.list(1);
  const result = await seedSystem(services, users[0]?.id);
  log(`Prompts: ${result.prompts.created.length} created, ${result.prompts.existing.length} already present.`);
  log(`Content templates created: ${result.templates}`);
  log(`Music library entries created: ${result.music}`);
  return 0;
}

async function cmdDemo(services: AppServices, args: string[]): Promise<number> {
  await runDemo(services, args);
  return 0;
}

async function runDemo(services: AppServices, args: string[]) {
  const opts = parseFlags(args);
  const result = await seedDemoChannel(services, {
    email: opts.email ?? 'owner@example.com',
    password: opts.password ?? 'change-me-now',
    channelName: opts.channel ?? 'My History Channel',
    niche: opts.niche ?? 'European history',
    language: opts.language ?? 'en',
    videosPerWeek: opts.videosPerWeek ? Number(opts.videosPerWeek) : 3,
    targetDurationMin: opts.duration ? Number(opts.duration) : 10,
    automationMode: (opts.mode as 'FULL_AUTO' | 'SEMI_AUTO' | 'MANUAL') ?? 'SEMI_AUTO',
  });
  log(`${result.created ? 'Created' : 'Found'} user ${result.user.email} (${result.user.id})`);
  log(`Channel "${result.channel.name}" (${result.channel.id}) — niche: ${result.settings.niche}`);
  log(`Automation mode: ${result.settings.automationMode}, ${result.settings.videosPerWeek} videos/week`);
  log('');
  log(`Next:  factory ideas ${result.channel.id}`);
  return result;
}

/**
 * The whole factory in one command.
 *
 * `demo`, `ideas` and `produce` are separate processes, and with no DATABASE_URL each one
 * gets its own in-memory database — so the channel the first creates does not exist for the
 * second. Chaining them here keeps the "no services, no credentials" promise honest instead
 * of handing someone a three-command sequence that cannot work.
 */
async function cmdQuickstart(services: AppServices, args: string[]): Promise<number> {
  if (!services.config.database.url) {
    log('No DATABASE_URL — running everything in one process against the in-memory database.');
    log('Nothing is persisted after this command exits. Set DATABASE_URL to keep the result.\n');
  }

  const { channel, settings } = await runDemo(services, args);

  log('');
  log('Generating ideas…');
  const generated = await services.ideas.generate(channel, settings, { count: 5 });
  const best = [...generated.ideas].sort((a, b) => b.overallScore - a.overallScore)[0];
  if (!best) return fail('No ideas were generated.');
  log(`  ${generated.ideas.length} ideas from ${generated.signalsUsed} trend signals.`);
  log(`  Best: [${best.overallScore}] ${best.title}\n`);

  log('Producing…');
  const started = await services.production.startFromIdea(best.id);
  return runPipeline(services, started.video.id);
}

async function cmdDoctor(services: AppServices): Promise<number> {
  log(`Environment      ${services.config.env}${services.config.offline ? ' (OFFLINE — mock providers)' : ''}`);
  log(`Database         ${services.config.database.url ? 'PostgreSQL' : 'in-memory'}`);
  log(`Queue            ${services.queue.driver}`);
  log(`Storage          ${services.storage.driver}`);
  const ffmpegOk = await services.renderer.tools.available();
  log(`FFmpeg           ${ffmpegOk ? 'available' : 'NOT FOUND — rendering will fail'}`);
  log('');
  log('Providers:');
  for (const entry of await services.registry.healthAll()) {
    const state = entry.configured ? (entry.health.ok ? 'ok' : 'unhealthy') : 'not configured';
    log(`  ${entry.key.padEnd(12)} ${state.padEnd(16)} ${entry.capabilities.join(', ')}`);
    if (!entry.configured && entry.missing.length) log(`  ${''.padEnd(12)} set: ${entry.missing.join(', ')}`);
    if (entry.configured && !entry.health.ok && entry.health.detail) {
      log(`  ${''.padEnd(12)} ${entry.health.detail}`);
    }
  }
  log('');
  log('Notification channels:');
  for (const channel of services.notifier.available()) {
    const state = !channel.configured
      ? 'not configured'
      : channel.targetSuppliesEndpoint
        ? 'ready — each target supplies its own webhook URL'
        : 'configured';
    log(`  ${channel.kind.padEnd(12)} ${state}`);
  }
  return ffmpegOk ? 0 : 1;
}

async function cmdIdeas(services: AppServices, args: string[]): Promise<number> {
  const channelId = args[0];
  if (!channelId) return fail('Usage: factory ideas <channelId>');
  const channel = await services.repos.channels.findById(channelId);
  const settings = channel ? await services.repos.channelSettings.findByChannel(channelId) : null;
  if (!channel || !settings) return fail(`Channel ${channelId} not found.`);

  const result = await services.ideas.generate(channel, settings, { count: 5 });
  log(`Generated ${result.ideas.length} ideas from ${result.signalsUsed} trend signals.\n`);
  for (const idea of [...result.ideas].sort((a, b) => b.overallScore - a.overallScore)) {
    log(`  [${String(idea.overallScore).padStart(3)}] ${idea.title}`);
    log(`        ${idea.id}`);
    log(
      `        demand ${idea.estimatedDemand} · trend ${idea.trendScore} · competition ${idea.competition} · CTR ${idea.estimatedCtr} · retention ${idea.estimatedRetention}`,
    );
  }
  log('');
  log(`Next:  factory produce <ideaId>`);
  return 0;
}

async function cmdProduce(services: AppServices, args: string[]): Promise<number> {
  const ideaId = args[0];
  if (!ideaId) return fail('Usage: factory produce <ideaId>');
  const started = await services.production.startFromIdea(ideaId);
  log(`Video ${started.video.id} created.`);
  log(started.reason);
  log('');
  return runPipeline(services, started.video.id);
}

async function cmdRun(services: AppServices, args: string[]): Promise<number> {
  const videoId = args[0];
  if (!videoId) return fail('Usage: factory run <videoId>');
  return runPipeline(services, videoId);
}

async function runPipeline(services: AppServices, videoId: string): Promise<number> {
  const outcomes = await services.runner.runToCompletion(videoId);
  for (const outcome of outcomes) {
    log(`  ${outcome.from.padEnd(20)} → ${outcome.to.padEnd(20)} ${outcome.note ?? ''}`);
  }
  const video = await services.repos.videos.findById(videoId);
  log('');
  log(`Final status: ${video?.status}`);
  if (video?.failureReason) log(`Failure: ${video.failureReason}`);
  if (video?.renderKey) log(`Render: ${services.storage.url(video.renderKey)}`);
  log(`Cost: $${(video?.actualCostUsd ?? 0).toFixed(4)}`);
  return video?.status === 'FAILED' ? 1 : 0;
}

async function cmdAutopilot(services: AppServices, args: string[]): Promise<number> {
  const channelId = args[0];
  const results = channelId
    ? [await services.autopilot.runForChannel(channelId, { force: true })]
    : await services.autopilot.runAll();
  for (const result of results) {
    log(`${result.channelId}: ${result.ran ? 'ran' : 'skipped'} — ${result.reason}`);
    log(
      `  buffer: ${result.buffer.scheduled} scheduled, ${result.buffer.ready} ready, ${result.buffer.inProduction} in production (target ${result.buffer.target})`,
    );
    if (result.ideasGenerated) log(`  ideas generated: ${result.ideasGenerated}`);
    for (const videoId of result.productionsStarted) log(`  started: ${videoId}`);
  }
  return 0;
}

async function cmdPublishDue(services: AppServices): Promise<number> {
  const published = await services.autopilot.publishDue();
  log(published.length ? `Queued ${published.length} videos for upload.` : 'Nothing is due for publishing.');
  for (const id of published) log(`  ${id}`);
  return 0;
}

async function cmdStatus(services: AppServices, args: string[]): Promise<number> {
  const videoId = args[0];
  if (!videoId) return fail('Usage: factory status <videoId>');
  const video = await services.repos.videos.findById(videoId);
  if (!video) return fail(`Video ${videoId} not found.`);

  log(`${video.title}`);
  log(`Status: ${video.status}${video.failureReason ? ` — ${video.failureReason}` : ''}`);
  log(`Cost: $${video.actualCostUsd.toFixed(4)}  Quality: ${video.qualityScore ?? '—'}/100\n`);

  const progress = (video.progress ?? {}) as Record<string, number>;
  const reachedIndex = PIPELINE_STAGES.findIndex((s) => s.status === video.status);
  for (const [i, stage] of PIPELINE_STAGES.entries()) {
    const percent = progress[stage.status] ?? (i < reachedIndex ? 100 : 0);
    const bar = '█'.repeat(Math.round(percent / 5)).padEnd(20, '·');
    log(`  ${stage.label.padEnd(20)} ${bar} ${String(percent).padStart(3)}%`);
  }
  return 0;
}

function parseFlags(args: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg?.startsWith('--')) continue;
    const [key, inline] = arg.slice(2).split('=');
    if (!key) continue;
    if (inline !== undefined) out[key] = inline;
    else {
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i += 1;
      } else out[key] = 'true';
    }
  }
  return out;
}

function printUsage(): void {
  log(`YouTube Content Factory — operator CLI

  factory quickstart [--niche …]     Everything at once: demo + ideas + produce one video
  factory seed                       Write prompts, content templates and the music library
  factory demo [--email --password --channel --niche --mode --duration --videosPerWeek]
  factory doctor                     Provider, storage, queue and FFmpeg health
  factory ideas <channelId>          Generate and score ideas
  factory produce <ideaId>           Start production and run it to completion
  factory run <videoId>              Advance one video as far as it will go
  factory autopilot [channelId]      One autopilot pass
  factory publish-due                Publish everything whose slot has arrived
  factory status <videoId>           Pipeline position of one video
  factory keygen                     Print a fresh 32-byte ENCRYPTION_KEY
`);
}

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

function fail(message: string): number {
  process.stderr.write(`${message}\n`);
  return 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    process.stderr.write(`${errorMessage(err)}\n`);
    if (err instanceof Error && err.stack) process.stderr.write(`${err.stack}\n`);
    process.exitCode = 1;
  });
