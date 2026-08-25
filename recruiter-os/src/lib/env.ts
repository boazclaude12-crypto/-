import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * Central place where process.env is read. Nothing else in the codebase touches
 * process.env directly, so required configuration is validated exactly once.
 */
export type AiProviderName = 'local' | 'anthropic';

function readSecret(): string {
  const fromEnv = process.env.AUTH_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 32) return fromEnv;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'AUTH_SECRET is missing or shorter than 32 characters. Set it before starting in production.',
    );
  }

  // Development convenience only: persist a generated secret so sessions survive restarts.
  const file = path.resolve(process.cwd(), 'data/.auth-secret');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, randomBytes(32).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(file, 'utf8').trim();
}

export const env = {
  get authSecret() {
    return readSecret();
  },
  get databaseFile() {
    return process.env.DATABASE_FILE || './data/recruiter.db';
  },
  get uploadDir() {
    return path.resolve(process.cwd(), process.env.UPLOAD_DIR || './data/uploads');
  },
  get aiProvider(): AiProviderName {
    const value = (process.env.AI_PROVIDER || 'local').toLowerCase();
    return value === 'anthropic' ? 'anthropic' : 'local';
  },
  get anthropicApiKey() {
    return process.env.ANTHROPIC_API_KEY?.trim() || '';
  },
  get anthropicModel() {
    return process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5';
  },
  get isProduction() {
    return process.env.NODE_ENV === 'production';
  },
  channel(name: 'whatsapp' | 'email' | 'sms' | 'calendar') {
    const key = `${name.toUpperCase()}_PROVIDER`;
    return {
      provider: process.env[key]?.trim() || 'mock',
      apiUrl: process.env[`${name.toUpperCase()}_API_URL`]?.trim() || '',
      apiToken: process.env[`${name.toUpperCase()}_API_TOKEN`]?.trim() || '',
      from: process.env[`${name.toUpperCase()}_FROM`]?.trim() || '',
    };
  },
};
