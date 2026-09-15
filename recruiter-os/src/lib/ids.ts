import { randomBytes, randomUUID } from 'node:crypto';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * Short, sortable-ish, URL-safe id: base36 timestamp + randomness.
 * Prefixed per entity so ids are self-describing in logs and URLs.
 */
export function newId(prefix: string): string {
  const time = Date.now().toString(36);
  const bytes = randomBytes(8);
  let random = '';
  for (const byte of bytes) random += ALPHABET[byte % ALPHABET.length];
  return `${prefix}_${time}${random}`;
}

export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function uuid(): string {
  return randomUUID();
}
