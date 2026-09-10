import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Secrets handling (spec §46). Three primitives, all from node:crypto:
 *  - password hashing with scrypt,
 *  - AES-256-GCM for OAuth tokens and provider keys at rest,
 *  - HMAC-SHA256 for webhook signatures.
 */

const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEY_LEN = 32;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password.normalize('NFKC'), salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_r,
    p: SCRYPT_p,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_r}$${SCRYPT_p}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(String(saltB64), 'base64');
  const expected = Buffer.from(String(hashB64), 'base64');
  const derived = scryptSync(password.normalize('NFKC'), salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

/** Session tokens: the client holds the token, the database only ever holds its hash. */
export function newSessionToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: sha256(token) };
}

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export interface Encryptor {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}

/**
 * AES-256-GCM. Output format: `v1.<iv>.<tag>.<ciphertext>` (all base64url) so the
 * envelope is self-describing and rotatable.
 */
export class AesGcmEncryptor implements Encryptor {
  private readonly key: Buffer;

  constructor(keyHex: string) {
    const key = Buffer.from(keyHex, 'hex');
    if (key.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters');
    }
    this.key = key;
  }

  static generateKey(): string {
    return randomBytes(32).toString('hex');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
  }

  decrypt(payload: string): string {
    const [version, ivB64, tagB64, dataB64] = payload.split('.');
    if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) {
      throw new Error('Malformed ciphertext envelope');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}

/** Webhook signatures (spec §66) — HMAC over `timestamp.body`, compared in constant time. */
export function signPayload(secret: string, body: string, timestamp: number): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export function verifySignature(
  secret: string,
  body: string,
  timestamp: number,
  signature: string,
  toleranceSec = 300,
  now = Date.now(),
): boolean {
  if (Math.abs(now / 1000 - timestamp) > toleranceSec) return false;
  const expected = Buffer.from(signPayload(secret, body, timestamp), 'utf8');
  const given = Buffer.from(signature, 'utf8');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * A string that refuses to leak. Provider keys are wrapped in this so an accidental
 * `JSON.stringify(config)` or template interpolation cannot print a secret.
 */
export class SecretString {
  constructor(private readonly value: string) {}
  reveal(): string {
    return this.value;
  }
  get present(): boolean {
    return this.value.length > 0;
  }
  hint(): string {
    return this.value.length <= 8 ? '••••' : `••••${this.value.slice(-4)}`;
  }
  toString(): string {
    return '[secret]';
  }
  toJSON(): string {
    return '[secret]';
  }
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return '[secret]';
  }
}
