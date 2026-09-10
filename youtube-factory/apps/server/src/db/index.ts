import type { AppConfig } from '../config/index.js';
import type { Clock } from '../shared/clock.js';
import { systemClock } from '../shared/clock.js';
import { InMemoryRepositories } from './memory/index.js';
import type { Repositories } from './ports.js';

export * from './ports.js';
export * from './types.js';
export { InMemoryRepositories } from './memory/index.js';

/**
 * Picks the persistence adapter. Prisma is loaded dynamically so a machine with no
 * DATABASE_URL (or no generated client) can still boot the in-memory stack.
 */
export async function createRepositories(config: AppConfig, clock: Clock = systemClock): Promise<Repositories> {
  if (!config.database.url) {
    if (config.isProduction) throw new Error('DATABASE_URL is required in production');
    return new InMemoryRepositories(clock);
  }
  const { PrismaRepositories } = await import('./prisma/index.js');
  return new PrismaRepositories(config.database.url);
}
