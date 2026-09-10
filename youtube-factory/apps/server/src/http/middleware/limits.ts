import type { RouteShorthandOptions } from 'fastify';

/**
 * Per-route rate limits (spec §46).
 *
 * These are deliberately per route rather than per plugin: `/api/auth/me` runs on every
 * page load and must not share a budget with `/api/auth/login`, or ordinary navigation
 * would sign the user out.
 */

/** Credential-taking endpoints: brute-force resistance, keyed by IP. */
export const strictLimit: RouteShorthandOptions = {
  config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
};

/** Endpoints that start paid generation work. */
export const generationLimit: RouteShorthandOptions = {
  config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
};
