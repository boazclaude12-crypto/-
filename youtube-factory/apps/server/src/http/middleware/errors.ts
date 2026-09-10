import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../../shared/errors.js';
import type { Logger } from '../../shared/logger.js';

/**
 * One error shape for the whole API. Internal detail never reaches the client in
 * production — the log gets the stack, the caller gets a code and a message.
 */
export function registerErrorHandler(app: FastifyInstance, logger: Logger, isProduction: boolean): void {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: { code: 'validation_error', message: 'Request validation failed', details: error.flatten() },
      });
    }

    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        logger.error('request failed', { path: request.url, code: error.code, message: error.message });
      }
      return reply.status(error.statusCode).send({ error: error.toJSON() });
    }

    // Fastify's own errors (rate limit, payload size, malformed JSON…).
    const status = error.statusCode ?? 500;
    if (status >= 500) {
      logger.error('unhandled request error', {
        path: request.url,
        message: error.message,
        stack: error.stack?.slice(0, 2000),
      });
    }
    return reply.status(status).send({
      error: {
        code: error.code ?? 'internal_error',
        message: status >= 500 && isProduction ? 'Something went wrong' : error.message,
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ error: { code: 'not_found', message: `No route for ${request.method} ${request.url}` } });
  });
}
