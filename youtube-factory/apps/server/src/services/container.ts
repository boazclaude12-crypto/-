import { buildAgents, PROMPT_SEED_MAP, PromptLibrary, type Agents } from '../agents/index.js';
import { loadConfig, type AppConfig } from '../config/index.js';
import { createRepositories, type Repositories } from '../db/index.js';
import { FfmpegRenderer } from '../media/renderer.js';
import { PipelineRunner } from '../pipeline/runner.js';
import { buildProviderRegistry, type ProviderRegistry } from '../providers/index.js';
import type { PublishingProvider } from '../providers/types.js';
import { createQueue, type JobQueue } from '../queue/index.js';
import { createStorage, type Storage } from '../storage/index.js';
import { systemClock, type Clock } from '../shared/clock.js';
import { createLogger, type Logger } from '../shared/logger.js';
import { Autopilot } from './autopilot.js';
import { BudgetGuard } from './budget.js';
import { CostOptimizer, CostReporter } from './cost.js';
import { buildDiscoveryService, type DiscoveryService } from './discovery.js';
import { IdeaService } from './ideas.js';
import { LearningEngine } from './learning.js';
import { buildNotifier, type Notifier } from './notifications.js';
import { ProductionService } from './production.js';
import { RulesEngine } from './rules.js';
import { SchedulingEngine } from './scheduler.js';

/**
 * The composition root. Every process — API, worker, CLI, tests — builds the same object
 * graph here, which is what stops the three from drifting apart.
 */
export interface AppServices {
  config: AppConfig;
  clock: Clock;
  logger: Logger;
  repos: Repositories;
  registry: ProviderRegistry;
  storage: Storage;
  queue: JobQueue;
  renderer: FfmpegRenderer;
  prompts: PromptLibrary;
  agents: Agents;
  budget: BudgetGuard;
  costs: CostOptimizer;
  costReporter: CostReporter;
  rules: RulesEngine;
  scheduler: SchedulingEngine;
  discovery: DiscoveryService;
  notifier: Notifier;
  learning: LearningEngine;
  ideas: IdeaService;
  production: ProductionService;
  runner: PipelineRunner;
  autopilot: Autopilot;
  youtube?: PublishingProvider;
  close(): Promise<void>;
}

export interface BuildOptions {
  config?: AppConfig;
  clock?: Clock;
  logger?: Logger;
  repos?: Repositories;
  queue?: JobQueue;
  storage?: Storage;
  registry?: ProviderRegistry;
}

export async function buildServices(opts: BuildOptions = {}): Promise<AppServices> {
  const config = opts.config ?? loadConfig();
  const clock = opts.clock ?? systemClock;
  const logger = opts.logger ?? createLogger(config.logLevel, { env: config.env });

  const repos = opts.repos ?? (await createRepositories(config, clock));
  const registry = opts.registry ?? buildProviderRegistry(config, clock, logger);
  const storage = opts.storage ?? createStorage(config);
  const queue = opts.queue ?? createQueue(config, clock, logger);
  const renderer = new FfmpegRenderer(config, logger);

  const prompts = new PromptLibrary(repos.prompts, PROMPT_SEED_MAP);
  const agents = buildAgents({
    config,
    registry,
    prompts,
    clock,
    logger,
    repos: { agentRuns: repos.agentRuns, usage: repos.usage, decisions: repos.decisions },
  });

  const budget = new BudgetGuard(repos.usage, repos.channelSettings, clock, config.limits.defaultMonthlyBudgetUsd);
  const costs = new CostOptimizer(registry, repos.assets, repos.decisions);
  const costReporter = new CostReporter(repos.usage);
  const rules = new RulesEngine(repos.rules);
  const scheduler = new SchedulingEngine(repos.schedules, repos.channelSettings, repos.videos, clock);
  const notifier = buildNotifier(repos.notifications, config, logger);
  const youtube = registry.publishing();
  const discovery = buildDiscoveryService(repos.discovery, config, youtube, logger);

  const learning = new LearningEngine({
    videos: repos.videos,
    analytics: repos.analytics,
    learnings: repos.learnings,
    scripts: repos.scripts,
    thumbnails: repos.thumbnails,
    seo: repos.seo,
    agents,
    clock,
    logger,
  });

  const ideas = new IdeaService({ repos, agents, discovery, learning, clock, logger, youtube });

  const runner = new PipelineRunner({
    config,
    repos,
    registry,
    agents,
    storage,
    renderer,
    budget,
    costs,
    scheduler,
    rules,
    notifier,
    queue,
    clock,
    logger,
  });

  const production = new ProductionService({ repos, runner, clock, logger });
  const autopilot = new Autopilot({
    repos,
    ideas,
    production,
    scheduler,
    budget,
    learning,
    agents,
    notifier,
    runner,
    clock,
    logger,
  });

  return {
    config,
    clock,
    logger,
    repos,
    registry,
    storage,
    queue,
    renderer,
    prompts,
    agents,
    budget,
    costs,
    costReporter,
    rules,
    scheduler,
    discovery,
    notifier,
    learning,
    ideas,
    production,
    runner,
    autopilot,
    youtube,
    async close() {
      await queue.close().catch(() => undefined);
      await repos.close().catch(() => undefined);
    },
  };
}
