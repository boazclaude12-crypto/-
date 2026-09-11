import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, seedChannel, type TestContext } from './harness.js';
import { InMemoryQueue, QUEUES } from '../queue/index.js';
import { FixedClock } from '../shared/clock.js';
import { MemoryLogger } from '../shared/logger.js';
import { BudgetGuard } from '../services/budget.js';
import { RulesEngine } from '../services/rules.js';
import { ProviderRegistry } from '../providers/registry.js';
import { MockLLMProvider } from '../providers/mock/index.js';
import { CostOptimizer } from '../services/cost.js';
import { usd } from '../shared/types.js';
import { AesGcmEncryptor } from '../shared/crypto.js';
import { DiscordChannel, Notifier, SlackChannel } from '../services/notifications.js';

let ctx: TestContext;

beforeEach(async () => {
  ctx = await createTestContext();
});
afterEach(async () => {
  await ctx.cleanup();
});

describe('job queue', () => {
  it('runs jobs, honours delays and reports counts', async () => {
    const clock = new FixedClock();
    const queue = new InMemoryQueue(clock);
    const seen: string[] = [];
    queue.register<{ id: string }>('q', async (job) => {
      seen.push(job.data.id);
    });

    await queue.enqueue('q', 'now', { id: 'a' });
    await queue.enqueue('q', 'later', { id: 'b' }, { delayMs: 5_000 });

    const before = await queue.counts('q');
    expect(before.waiting).toBe(1);
    expect(before.delayed).toBe(1);

    await queue.runUntilIdle();
    expect(seen).toEqual(['a', 'b']);
    expect((await queue.counts('q')).completed).toBe(2);
    await queue.close();
  });

  it('retries a failing job and then dead-letters it', async () => {
    const clock = new FixedClock();
    const queue = new InMemoryQueue(clock);
    let attempts = 0;
    queue.register('q', async () => {
      attempts += 1;
      throw new Error('always fails');
    });

    await queue.enqueue('q', 'bad', {}, { maxAttempts: 3 });
    await queue.runUntilIdle();

    expect(attempts).toBe(3);
    expect((await queue.counts('q')).failed).toBe(1);
    await queue.close();
  });

  it('treats an explicit job id as an idempotency key', async () => {
    const clock = new FixedClock();
    const queue = new InMemoryQueue(clock);
    let runs = 0;
    queue.register('q', async () => {
      runs += 1;
    });
    await queue.enqueue('q', 'once', {}, { jobId: 'fixed' });
    await queue.enqueue('q', 'once', {}, { jobId: 'fixed' });
    await queue.runUntilIdle();
    expect(runs).toBe(1);
    await queue.close();
  });
});

describe('budget protection', () => {
  it('warns at 80%, degrades at 90% and blocks at 100%', async () => {
    const seeded = await seedChannel(ctx, { monthlyBudgetUsd: 100 });
    const guard = new BudgetGuard(ctx.repos.usage, ctx.repos.channelSettings, ctx.clock, 100);

    const spend = async (amount: number) => {
      await ctx.repos.usage.record({
        channelId: seeded.channel.id, videoId: null, jobId: null,
        provider: 'mock', operation: 'test', model: null,
        inputUnits: 0, outputUnits: 0, unit: 'request',
        estimatedCost: amount, actualCost: amount, latencyMs: 1, status: 'ok', error: null,
      });
    };

    expect((await guard.status(seeded.channel.id)).level).toBe('ok');
    await spend(82);
    expect((await guard.status(seeded.channel.id)).level).toBe('warning');
    await spend(10);
    const critical = await guard.status(seeded.channel.id);
    expect(critical.level).toBe('critical');
    expect(critical.degrade).toBe(true);
    expect(critical.blocked).toBe(false);
    await spend(10);
    const exceeded = await guard.status(seeded.channel.id);
    expect(exceeded.level).toBe('exceeded');
    expect(exceeded.blocked).toBe(true);
  });

  it('lets essential work through but stops discretionary spend', async () => {
    const seeded = await seedChannel(ctx, { monthlyBudgetUsd: 10 });
    const guard = new BudgetGuard(ctx.repos.usage, ctx.repos.channelSettings, ctx.clock, 10);
    await ctx.repos.usage.record({
      channelId: seeded.channel.id, videoId: null, jobId: null,
      provider: 'mock', operation: 'test', model: null,
      inputUnits: 0, outputUnits: 0, unit: 'request',
      estimatedCost: 12, actualCost: 12, latencyMs: 1, status: 'ok', error: null,
    });

    expect((await guard.check(seeded.channel.id, usd(1), false)).allowed).toBe(false);
    expect((await guard.check(seeded.channel.id, usd(1), true)).allowed).toBe(true);
    await expect(guard.require(seeded.channel.id, usd(1), false)).rejects.toThrow(/budget/i);
  });

  it('refuses an operation larger than the remaining budget', async () => {
    const seeded = await seedChannel(ctx, { monthlyBudgetUsd: 5 });
    const guard = new BudgetGuard(ctx.repos.usage, ctx.repos.channelSettings, ctx.clock, 5);
    const decision = await guard.check(seeded.channel.id, usd(9));
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('only $5.00');
  });
});

describe('automation rules', () => {
  it('matches the highest-priority rule and explains why', async () => {
    const seeded = await seedChannel(ctx);
    const engine = new RulesEngine(ctx.repos.rules);
    for (const rule of RulesEngine.defaultsFor(seeded.settings)) {
      await ctx.repos.rules.create(rule);
    }

    const weakFacts = await engine.evaluate(seeded.channel.id, { factConfidence: 0.2, qcScore: 90 });
    expect(weakFacts.action?.type).toBe('requireApproval');
    expect(weakFacts.reason).toContain('factConfidence');

    const weakQc = await engine.evaluate(seeded.channel.id, { qcScore: 10 });
    expect(weakQc.action?.type).toBe('regenerate');

    const clean = await engine.evaluate(seeded.channel.id, { qcScore: 95, factConfidence: 0.99, costUsd: 1 });
    expect(clean.action).toBeNull();
  });

  it('ignores rules whose metric was not supplied', async () => {
    const seeded = await seedChannel(ctx);
    const engine = new RulesEngine(ctx.repos.rules);
    await ctx.repos.rules.create({
      channelId: seeded.channel.id,
      name: 'expensive',
      condition: { metric: 'costUsd', op: 'gt', value: 5 },
      action: { type: 'requireApproval' },
      enabled: true,
      priority: 1,
    });
    expect((await engine.evaluate(seeded.channel.id, { qcScore: 90 })).action).toBeNull();
    expect((await engine.evaluate(seeded.channel.id, { costUsd: 9 })).action?.type).toBe('requireApproval');
  });
});

describe('provider registry', () => {
  it('never selects an unconfigured provider', () => {
    const registry = new ProviderRegistry();
    registry.register({
      key: 'unconfigured',
      name: 'Unconfigured',
      capabilities: ['generateText'],
      isConfigured: () => false,
      missingConfig: () => ['SOME_KEY'],
      estimateCost: () => usd(0),
      health: async () => ({ ok: false }),
      generateText: async () => {
        throw new Error('must never be called');
      },
    } as never);

    expect(registry.chain({ capability: 'generateText' })).toHaveLength(0);
    expect(() => registry.select({ capability: 'generateText' })).toThrow(/No configured provider/);
  });

  it('orders the chain by cost and skips providers whose breaker is open', () => {
    const registry = new ProviderRegistry();
    const make = (key: string, cost: number) =>
      ({
        key,
        name: key,
        capabilities: ['generateText'],
        isConfigured: () => true,
        missingConfig: () => [],
        estimateCost: () => usd(cost),
        health: async () => ({ ok: true }),
        generateText: async () => ({ text: key, usage: { inputUnits: 0, outputUnits: 0, unit: 'token', cost: usd(cost) } }),
      }) as never;

    registry.register(make('expensive', 10));
    registry.register(make('cheap', 1));

    const chain = registry.chain({
      capability: 'generateText',
      estimate: { capability: 'generateText', inputTokens: 100, outputTokens: 100 },
    });
    expect(chain.map((c) => c.entry.provider.key)).toEqual(['cheap', 'expensive']);

    for (let i = 0; i < 5; i += 1) registry.recordFailure('cheap', new Error('down'));
    const afterFailure = registry.chain({ capability: 'generateText' });
    expect(afterFailure.map((c) => c.entry.provider.key)).toEqual(['expensive']);
  });

  it('meters every call, successful or not', async () => {
    const seeded = await seedChannel(ctx);
    const provider = new MockLLMProvider();
    provider.failNextCalls = 1;

    const { meter } = await import('../providers/registry.js');
    await expect(
      meter(
        { usage: ctx.repos.usage },
        { providerKey: 'mock', operation: 'test', ctx: { channelId: seeded.channel.id }, estimated: usd(0.5) },
        () => provider.generateText({ system: 's', prompt: 'p' }),
      ),
    ).rejects.toThrow();

    await meter(
      { usage: ctx.repos.usage },
      { providerKey: 'mock', operation: 'test', ctx: { channelId: seeded.channel.id }, estimated: usd(0.5) },
      () => provider.generateText({ system: 's', prompt: 'p' }),
    );

    const records = await ctx.repos.usage.listRecent(10, seeded.channel.id);
    expect(records).toHaveLength(2);
    expect(records.filter((r) => r.status === 'error')).toHaveLength(1);
    expect(records.filter((r) => r.status === 'ok')).toHaveLength(1);
  });
});

describe('cost optimisation', () => {
  it('reserves generated video for important scenes and downgrades under budget pressure', async () => {
    const seeded = await seedChannel(ctx);
    const registry = new ProviderRegistry();
    registry.register({
      key: 'vendor',
      name: 'Vendor',
      capabilities: ['generateImage', 'generateVideo'],
      isConfigured: () => true,
      missingConfig: () => [],
      estimateCost: (input: { capability: string; seconds?: number }) =>
        input.capability === 'generateVideo' ? usd(1.2) : usd(0.03),
      health: async () => ({ ok: true }),
      generateImage: async () => ({ images: [], usage: { inputUnits: 0, outputUnits: 1, unit: 'image', cost: usd(0.03) } }),
      generateVideo: async () => ({ video: { mimeType: 'video/mp4' }, usage: { inputUnits: 0, outputUnits: 1, unit: 'second', cost: usd(1.2) } }),
    } as never);

    const optimizer = new CostOptimizer(registry, ctx.repos.assets, ctx.repos.decisions);
    const healthy = { degrade: false, blocked: false } as never;

    const important = await optimizer.choose(
      { id: 's1', videoId: 'v1', durationSec: 8, importance: 0.9, prompt: 'hero shot' },
      { budget: healthy, videoBudgetRemainingUsd: 10, channelId: seeded.channel.id },
    );
    expect(important.strategy).toBe('GENERATED_VIDEO');

    const filler = await optimizer.choose(
      { id: 's2', videoId: 'v1', durationSec: 8, importance: 0.2, prompt: 'b-roll' },
      { budget: healthy, videoBudgetRemainingUsd: 10, channelId: seeded.channel.id },
    );
    expect(filler.strategy).toBe('IMAGE_MOTION');
    expect(filler.reason).toContain('importance');

    const broke = await optimizer.choose(
      { id: 's3', videoId: 'v1', durationSec: 8, importance: 0.9, prompt: 'hero shot 2' },
      { budget: healthy, videoBudgetRemainingUsd: 0.1, channelId: seeded.channel.id },
    );
    expect(broke.strategy).toBe('IMAGE_MOTION');

    const decisions = await ctx.repos.decisions.listByVideo('v1');
    expect(decisions.length).toBe(3);
    for (const decision of decisions) expect(decision.reason.length).toBeGreaterThan(20);
  });

  it('reuses an asset produced for an identical prompt', async () => {
    const seeded = await seedChannel(ctx);
    const { promptChecksum } = await import('../services/cost.js');
    await ctx.repos.assets.create({
      videoId: 'v1', kind: 'IMAGE', storageKey: 'k', mimeType: 'image/png',
      bytes: 1, durationSec: null, width: 1, height: 1, provider: 'mock', externalId: null,
      costUsd: 0, license: 'owned', attribution: null,
      checksum: promptChecksum('v1', 'repeated prompt'), metadata: null,
    });

    const optimizer = new CostOptimizer(new ProviderRegistry(), ctx.repos.assets, ctx.repos.decisions);
    const choice = await optimizer.choose(
      { id: 's1', videoId: 'v1', durationSec: 8, importance: 0.9, prompt: 'repeated prompt' },
      { budget: { degrade: false, blocked: false } as never, videoBudgetRemainingUsd: 10, channelId: seeded.channel.id },
    );
    expect(choice.strategy).toBe('EXISTING_MEDIA');
    expect(choice.cost.usd).toBe(0);
  });
});

describe('scheduling engine', () => {
  it('reserves distinct slots and never double-books', async () => {
    const seeded = await seedChannel(ctx);
    const a = await ctx.repos.videos.create(videoFixture(seeded.channel.id, 'A'));
    const b = await ctx.repos.videos.create(videoFixture(seeded.channel.id, 'B'));

    const first = await ctx.services.scheduler.reserve(seeded.channel.id, a.id);
    const second = await ctx.services.scheduler.reserve(seeded.channel.id, b.id);
    expect(second.publishAt.getTime()).toBeGreaterThan(first.publishAt.getTime());

    // Re-reserving is idempotent.
    const again = await ctx.services.scheduler.reserve(seeded.channel.id, a.id);
    expect(again.publishAt.getTime()).toBe(first.publishAt.getTime());
  });

  it('frees a slot when production fails', async () => {
    const seeded = await seedChannel(ctx);
    const video = await ctx.repos.videos.create(videoFixture(seeded.channel.id, 'A'));
    await ctx.services.scheduler.reserve(seeded.channel.id, video.id);
    expect(await ctx.repos.schedules.findByVideo(video.id)).not.toBeNull();

    await ctx.services.scheduler.release(video.id);
    expect((await ctx.repos.videos.findById(video.id))?.publishAt).toBeNull();
    const slots = await ctx.repos.schedules.listUpcoming(seeded.channel.id, new Date(0));
    expect(slots.every((s) => !s.videoId)).toBe(true);
  });

  it('recomputes the queue after a delay', async () => {
    const seeded = await seedChannel(ctx);
    const a = await ctx.repos.videos.create({ ...videoFixture(seeded.channel.id, 'A'), status: 'READY' });
    ctx.clock.advance(60_000);
    const b = await ctx.repos.videos.create({ ...videoFixture(seeded.channel.id, 'B'), status: 'READY' });

    const assignments = await ctx.services.scheduler.recalculate(seeded.channel.id);
    expect(assignments).toHaveLength(2);
    expect(assignments[0]!.slot.videoId).toBe(a.id);
    expect(assignments[1]!.slot.videoId).toBe(b.id);
    expect(assignments[1]!.publishAt.getTime()).toBeGreaterThan(assignments[0]!.publishAt.getTime());
  });
});

describe('oauth token storage', () => {
  it('stores tokens encrypted and never in the clear', async () => {
    const seeded = await seedChannel(ctx);
    const encryptor = new AesGcmEncryptor(ctx.config.security.encryptionKey);
    await ctx.repos.oauth.upsert({
      channelId: seeded.channel.id,
      provider: 'google',
      externalAccountId: 'UC123',
      accessToken: encryptor.encrypt('ya29.access'),
      refreshToken: encryptor.encrypt('1//refresh'),
      scope: 'youtube.upload',
      tokenType: 'Bearer',
      expiresAt: new Date(ctx.clock.now().getTime() + 3600_000),
    });

    const stored = await ctx.repos.oauth.findByChannel(seeded.channel.id);
    expect(stored!.accessToken).not.toContain('ya29');
    expect(stored!.refreshToken).not.toContain('refresh');
    expect(encryptor.decrypt(stored!.accessToken)).toBe('ya29.access');
    expect(encryptor.decrypt(stored!.refreshToken!)).toBe('1//refresh');
  });
});

describe('prompt library', () => {
  it('seeds idempotently and serves the active version', async () => {
    const first = await ctx.services.prompts.seedMissing();
    expect(first.created.length).toBe(0); // the harness already seeded
    expect(first.existing.length).toBeGreaterThan(10);

    const resolved = await ctx.services.prompts.resolve('SCRIPT_AGENT', { topic: 'Rome', targetDurationSec: 600 });
    expect(resolved.version).toBe(1);
    expect(resolved.userPrompt).toContain('Rome');
    expect(resolved.systemPrompt).toContain('SCRIPT_AGENT');
  });

  it('prefers a newer active version and can be rolled back', async () => {
    await ctx.repos.prompts.create({
      userId: null, name: 'SCRIPT_AGENT', version: 2, provider: null,
      systemPrompt: 'v2 system', userTemplate: 'v2 for {{topic}}', variables: ['topic'],
      active: true, notes: 'experiment',
    });
    ctx.services.prompts.invalidate();

    const v2 = await ctx.services.prompts.resolve('SCRIPT_AGENT', { topic: 'Rome' });
    expect(v2.version).toBe(2);
    expect(v2.userPrompt).toBe('v2 for Rome');

    const versions = await ctx.repos.prompts.listVersions('SCRIPT_AGENT');
    const v1 = versions.find((p) => p.version === 1)!;
    await ctx.repos.prompts.activate(v1.id);
    ctx.services.prompts.invalidate();
    expect((await ctx.services.prompts.resolve('SCRIPT_AGENT', { topic: 'Rome' })).version).toBe(1);
  });
});

describe('notifications', () => {
  it('delivers only to targets subscribed to the event', async () => {
    const seeded = await seedChannel(ctx);
    await ctx.repos.notifications.create({
      userId: seeded.user.id, kind: 'memory', target: 'inbox-a',
      events: ['UPLOAD_SUCCESS'], enabled: true,
    });
    await ctx.repos.notifications.create({
      userId: seeded.user.id, kind: 'memory', target: 'inbox-b',
      events: [], enabled: true,
    });
    await ctx.repos.notifications.create({
      userId: seeded.user.id, kind: 'memory', target: 'inbox-off',
      events: [], enabled: false,
    });

    const delivered = await ctx.services.notifier.notify(seeded.user.id, {
      event: 'UPLOAD_SUCCESS', title: 'Published', body: 'done',
    });
    expect(delivered).toBe(2);

    const other = await ctx.services.notifier.notify(seeded.user.id, {
      event: 'QC_FAILED', title: 'Failed', body: 'nope',
    });
    expect(other).toBe(1);
  });

  it('fails loudly rather than dropping a webhook message with nowhere to go', async () => {
    const seeded = await seedChannel(ctx);
    const logger = new MemoryLogger();
    const notifier = new Notifier(ctx.repos.notifications, logger)
      .register(new DiscordChannel())
      .register(new SlackChannel());

    for (const kind of ['discord', 'slack']) {
      await ctx.repos.notifications.create({
        userId: seeded.user.id, kind, target: '', events: [], enabled: true,
      });
    }

    // Neither target carries a URL and no default webhook is configured. A silent `return`
    // here would report a healthy delivery and send nothing, so the count must stay at zero
    // and the reason must reach the log.
    const delivered = await notifier.notify(seeded.user.id, {
      event: 'UPLOAD_SUCCESS', title: 'Published', body: 'done',
    });
    expect(delivered).toBe(0);

    const warnings = logger.lines
      .map((line) => JSON.parse(line) as { msg: string; kind?: string; error?: string })
      .filter((entry) => entry.msg === 'notification delivery failed');
    expect(warnings).toHaveLength(2);
    expect(warnings.map((w) => w.kind).sort()).toEqual(['discord', 'slack']);
    for (const warning of warnings) {
      expect(warning.error).toContain('webhook URL');
    }
  });

  it('reports webhook channels as target-supplied rather than plain "configured"', () => {
    const notifier = new Notifier(ctx.repos.notifications)
      .register(new DiscordChannel())
      .register(new SlackChannel());
    for (const entry of notifier.available()) {
      expect(entry.configured).toBe(true);
      expect(entry.targetSuppliesEndpoint).toBe(true);
    }
  });
});

function videoFixture(channelId: string, title: string) {
  return {
    channelId, ideaId: null, templateId: null, title,
    status: 'READY' as const, previousStatus: null, progress: {},
    targetDurationSec: 300, actualDurationSec: null, language: 'en',
    renderKey: null, renderWidth: null, renderHeight: null, fileSizeBytes: null,
    qualityScore: null, qualityBreakdown: null, factConfidence: null, retentionScore: null,
    estimatedCostUsd: 0, actualCostUsd: 0, failureReason: null,
    publishAt: null, publishedAt: null, youtubeVideoId: null,
  };
}
