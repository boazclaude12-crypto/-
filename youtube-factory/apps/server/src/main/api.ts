import 'dotenv/config';
import { buildApp } from '../http/app.js';
import { buildServices } from '../services/container.js';
import { errorMessage } from '../shared/errors.js';

/** HTTP entrypoint. Long work is enqueued here and executed by the worker process. */
async function main(): Promise<void> {
  const services = await buildServices();
  const app = await buildApp(services);

  const shutdown = async (signal: string) => {
    services.logger.info('shutting down', { signal });
    await app.close().catch(() => undefined);
    await services.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port: services.config.http.port, host: services.config.http.host });
  services.logger.info('api listening', {
    port: services.config.http.port,
    env: services.config.env,
    offline: services.config.offline,
    queue: services.queue.driver,
    storage: services.storage.driver,
  });
}

main().catch((err) => {
  process.stderr.write(`Failed to start the API: ${errorMessage(err)}\n`);
  process.exit(1);
});
