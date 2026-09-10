import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type { AppServices } from '../services/container.js';
import { attachUser } from './middleware/auth.js';
import { registerErrorHandler } from './middleware/errors.js';
import { registerCsrf, registerSecurityHeaders } from './middleware/security.js';
import { authRoutes } from './routes/auth.js';
import { channelRoutes } from './routes/channels.js';
import { contentRoutes } from './routes/content.js';
import { insightRoutes } from './routes/insights.js';
import { webhookRoutes } from './routes/webhooks.js';
import { PIPELINE_STAGES } from '../pipeline/state-machine.js';

/**
 * The HTTP surface (spec §65). This process never runs a pipeline step — routes validate,
 * authorise, persist and enqueue. Anything that takes minutes belongs to the worker.
 */
/**
 * Origins allowed to send credentialed requests. Production trusts exactly the configured
 * app URL; outside production the localhost/127.0.0.1 pair is also accepted, because they
 * are the same machine and treating them as different origins is a pure development
 * footgun.
 */
export function allowedOrigins(config: AppServices['config']): string[] {
  const origins = new Set([config.http.appUrl]);
  if (!config.isProduction) {
    origins.add(config.http.appUrl.replace('localhost', '127.0.0.1'));
    origins.add(config.http.appUrl.replace('127.0.0.1', 'localhost'));
  }
  return [...origins];
}

export async function buildApp(services: AppServices): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: services.config.isProduction,
  });

  await app.register(cors, {
    origin: allowedOrigins(services.config),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });
  await app.register(cookie, { secret: services.config.security.webhookSecret });

  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (request) => (request as { user?: { id: string } }).user?.id ?? request.ip,
  });

  registerSecurityHeaders(app, services.config.isProduction);
  // Webhooks carry their own HMAC and are called by machines, so they are CSRF-exempt.
  registerCsrf(app, services.config, ['/api/webhooks/'], allowedOrigins(services.config));
  registerErrorHandler(app, services.logger, services.config.isProduction);

  app.addHook('preHandler', attachUser(services));

  // Tighter limits are applied per route (see `strictLimit` in the route modules) rather
  // than per plugin: the credential-taking endpoints need a hard cap, but `/api/auth/me`
  // runs on every page load and must not share it.
  await app.register(async (scoped) => {
    await authRoutes(scoped, services);
  });
  await app.register(async (scoped) => {
    await contentRoutes(scoped, services);
  });
  await app.register(async (scoped) => {
    await channelRoutes(scoped, services);
  });
  await app.register(async (scoped) => {
    await insightRoutes(scoped, services);
  });
  await app.register(async (scoped) => {
    await webhookRoutes(scoped, services);
  });

  app.get('/api/health', async () => ({
    ok: true,
    env: services.config.env,
    offline: services.config.offline,
    time: services.clock.now().toISOString(),
    queue: services.queue.driver,
    storage: services.storage.driver,
    database: services.config.database.url ? 'postgres' : 'memory',
  }));

  app.get('/api/meta', async () => ({
    stages: PIPELINE_STAGES,
    offline: services.config.offline,
    registrationOpen: services.config.security.allowRegistration,
  }));

  return app;
}
