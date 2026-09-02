import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Every test file imports this first. It points the app at a throwaway database, so
 * tests exercise the real schema and the real queries without touching dev data.
 */
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recruiter-os-test-'));
process.env.DATABASE_FILE = path.join(root, 'test.db');
process.env.UPLOAD_DIR = path.join(root, 'uploads');
process.env.AUTH_SECRET = 'test-secret-value-that-is-long-enough-1234567890';
process.env.AI_PROVIDER = 'local';
Object.assign(process.env, { NODE_ENV: 'test' });

process.on('exit', () => {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

export const TEST_ROOT = root;

/** Creates an isolated user + organisation and returns their ids. */
export async function createOrg(email = `t${Date.now()}${Math.random().toString(36).slice(2, 7)}@test.local`) {
  const { registerUser } = await import('../src/lib/auth/service');
  const { user, org } = await registerUser({
    name: 'בודק',
    email,
    password: 'password123',
    orgName: 'ארגון בדיקה',
  });
  return { userId: user.id, orgId: org.id, email };
}
