import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../../config/index.js';
import { ForbiddenError } from '../../shared/errors.js';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF defence (spec §46): the session cookie is SameSite=Lax, and every unsafe method is
 * additionally checked against the Origin header. Browsers always send Origin on
 * cross-origin unsafe requests, so a forged form post from another site is rejected.
 *
 * Routes that are called by machines rather than browsers (webhooks, which carry their own
 * HMAC signature) are exempt.
 */
export function registerCsrf(
  app: FastifyInstance,
  config: AppConfig,
  exemptPrefixes: string[] = [],
  extraOrigins: string[] = [],
): void {
  const allowed = new Set([config.http.appUrl, config.http.apiUrl, ...extraOrigins].filter(Boolean));

  app.addHook('onRequest', async (request: FastifyRequest) => {
    if (!UNSAFE_METHODS.has(request.method)) return;
    if (exemptPrefixes.some((prefix) => request.url.startsWith(prefix))) return;

    const origin = request.headers.origin;
    // No Origin means a non-browser client (curl, the CLI, a server) — the session cookie
    // could not have been attached by a third-party site in that case.
    if (!origin) return;
    if (!allowed.has(origin)) {
      throw new ForbiddenError(`Cross-origin request from ${origin} is not allowed`);
    }
  });
}

/** Security headers, including a CSP that leaves no room for injected script (spec §46). */
export function registerSecurityHeaders(app: FastifyInstance, isProduction: boolean): void {
  app.addHook('onSend', async (_request: FastifyRequest, reply: FastifyReply, payload) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'strict-origin-when-cross-origin');
    reply.header('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    reply.header(
      'content-security-policy',
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    if (isProduction) reply.header('strict-transport-security', 'max-age=31536000; includeSubDomains');
    return payload;
  });
}
