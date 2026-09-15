import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { env } from './env';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Encryption key for stored credentials.
 *
 * Derived from AUTH_SECRET through HKDF with its own info string, so the key that
 * protects mailbox passwords is not the same bytes that sign session tokens: leaking one
 * does not hand over the other. Deriving on each call keeps the secret out of module
 * state, and HKDF is cheap.
 */
function key(): Buffer {
  return Buffer.from(hkdfSync('sha256', env.authSecret, '', 'recruiter-os:credential:v1', 32));
}

/**
 * Encrypts a secret for storage.
 *
 * Format is `v1.<iv>.<tag>.<ciphertext>`, base64url throughout. The version prefix is
 * there so a future key rotation can recognise and re-wrap old values rather than
 * failing on them.
 */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

/** Returns null rather than throwing when a value cannot be read — a rotated or corrupt
 *  credential should prompt the user to re-enter it, not crash the page showing it. */
export function decryptSecret(value: string): string | null {
  try {
    const [version, iv, tag, ciphertext] = value.split('.');
    if (version !== 'v1' || !iv || !tag || !ciphertext) return null;
    const tagBuffer = Buffer.from(tag, 'base64url');
    if (tagBuffer.length !== TAG_BYTES) return null;

    const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(tagBuffer);
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}
