import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, type AppConfig } from '../config/index.js';
import { InMemoryRepositories } from '../db/memory/index.js';
import { InMemoryQueue } from '../queue/index.js';
import { buildServices, type AppServices } from '../services/container.js';
import { seedDemoChannel, type DemoResult } from '../cli/seed.js';
import { FixedClock } from '../shared/clock.js';
import { MemoryLogger } from '../shared/logger.js';
import { AesGcmEncryptor } from '../shared/crypto.js';
import { newId } from '../shared/ids.js';
import type { ChannelSettingsRecord } from '../db/types.js';

/**
 * Test harness: the real object graph, wired to in-memory persistence, an in-process queue
 * and the mock providers. Everything under test is production code — only the adapters at
 * the edges change.
 */
export interface TestContext {
  services: AppServices;
  repos: InMemoryRepositories;
  queue: InMemoryQueue;
  clock: FixedClock;
  logger: MemoryLogger;
  config: AppConfig;
  dir: string;
  cleanup(): Promise<void>;
}

export function testConfig(overrides: Record<string, string> = {}): { config: AppConfig; dir: string } {
  const dir = join(tmpdir(), `ycf-test-${newId()}`);
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    OFFLINE_MODE: 'true',
    QUEUE_DRIVER: 'memory',
    STORAGE_DRIVER: 'local',
    STORAGE_LOCAL_DIR: join(dir, 'storage'),
    MEDIA_WORK_DIR: join(dir, 'work'),
    ENCRYPTION_KEY: AesGcmEncryptor.generateKey(),
    RENDER_WIDTH: '640',
    RENDER_HEIGHT: '360',
    RENDER_FPS: '24',
    RENDER_PRESET: 'ultrafast',
    RENDER_CRF: '34',
    PUBLIC_APP_URL: 'http://localhost:3000',
    ...overrides,
  } as NodeJS.ProcessEnv);
  return { config, dir };
}

export async function createTestContext(overrides: Record<string, string> = {}): Promise<TestContext> {
  const { config, dir } = testConfig(overrides);
  const clock = new FixedClock(new Date('2026-01-05T09:00:00.000Z'));
  const logger = new MemoryLogger();
  const repos = new InMemoryRepositories(clock);
  const queue = new InMemoryQueue(clock, logger);

  const services = await buildServices({ config, clock, logger, repos, queue });
  await services.prompts.seedMissing();

  return {
    services,
    repos,
    queue,
    clock,
    logger,
    config,
    dir,
    async cleanup() {
      await services.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export interface SeededChannel extends DemoResult {
  settings: ChannelSettingsRecord;
}

export async function seedChannel(
  ctx: TestContext,
  overrides: Partial<Parameters<typeof seedDemoChannel>[1]> = {},
): Promise<SeededChannel> {
  return seedDemoChannel(ctx.services, {
    email: `owner-${newId()}@example.test`,
    password: 'test-password-1234',
    channelName: 'Test Channel',
    niche: 'European history',
    automationMode: 'FULL_AUTO',
    targetDurationMin: 4,
    ...overrides,
  });
}

/** Connects a channel through the mock OAuth flow, as the API route does. */
export async function connectChannel(ctx: TestContext, channelId: string): Promise<string> {
  const provider = ctx.services.registry.publishing();
  if (!provider) throw new Error('No publishing provider registered');
  const tokens = await provider.exchangeCode('test-code');
  const remote = await provider.getChannel(tokens.accessToken);
  const encryptor = new AesGcmEncryptor(ctx.config.security.encryptionKey);

  await ctx.repos.channels.update(channelId, {
    youtubeChannelId: remote.id,
    subscriberCount: remote.subscriberCount ?? null,
    videoCount: remote.videoCount ?? null,
    viewCount: remote.viewCount ?? null,
  });
  await ctx.repos.oauth.upsert({
    channelId,
    provider: 'google',
    externalAccountId: remote.id,
    accessToken: encryptor.encrypt(tokens.accessToken),
    refreshToken: encryptor.encrypt(tokens.refreshToken ?? ''),
    scope: tokens.scope,
    tokenType: tokens.tokenType,
    expiresAt: tokens.expiresAt,
  });
  return remote.id;
}

/** True when FFmpeg is on PATH — render tests skip themselves rather than failing on CI. */
export async function ffmpegAvailable(ctx: TestContext): Promise<boolean> {
  return ctx.services.renderer.tools.available();
}
