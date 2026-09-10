import { randomBytes, randomUUID } from 'node:crypto';

/**
 * Collision-resistant, sortable-ish identifier. Mirrors the shape cuid2 produces
 * (lowercase base36, prefixed) without pulling in a dependency for it.
 */
export function newId(prefix = ''): string {
  const time = Date.now().toString(36);
  const rand = randomBytes(10).toString('hex');
  const body = `${time}${rand}`;
  return prefix ? `${prefix}_${body}` : body;
}

export function newUuid(): string {
  return randomUUID();
}

/** Deterministic short token used for idempotency keys on queue jobs. */
export function shortToken(bytes = 8): string {
  return randomBytes(bytes).toString('base64url');
}
