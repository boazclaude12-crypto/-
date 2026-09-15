import { getDb } from '../db/index';
import { repos } from '../db/repos';
import { newId } from '../ids';
import { nowIso } from '../time';
import { bootstrapOrganization } from '../domain/bootstrap';
import { hashPassword, verifyPassword } from './password';
import type { OrganizationRow, UserRow } from '../types';

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  orgName?: string;
}

export class AuthError extends Error {
  code: 'email_taken' | 'invalid_credentials';
  constructor(code: AuthError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

export function findUserByEmail(email: string): UserRow | undefined {
  return getDb().get<UserRow>('SELECT * FROM users WHERE email = ?', email.trim().toLowerCase());
}

/** Creates the user, their organisation, the membership and all default data. */
export async function registerUser(input: RegisterInput): Promise<{ user: UserRow; org: OrganizationRow }> {
  const email = input.email.trim().toLowerCase();
  if (findUserByEmail(email)) throw new AuthError('email_taken', 'קיים כבר חשבון עם כתובת המייל הזו');

  const passwordHash = await hashPassword(input.password);
  const db = getDb();

  return db.transaction(() => {
    const userId = newId('usr');
    const orgId = newId('org');
    const timestamp = nowIso();

    db.run(
      `INSERT INTO users (id, email, password_hash, name, locale, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'he', ?, ?)`,
      userId, email, passwordHash, input.name.trim(), timestamp, timestamp,
    );
    db.run(
      `INSERT INTO organizations (id, name, owner_user_id, currency, timezone, created_at)
       VALUES (?, ?, ?, 'ILS', 'Asia/Jerusalem', ?)`,
      orgId, (input.orgName || `הגיוס של ${input.name}`).trim(), userId, timestamp,
    );
    db.run(
      'INSERT INTO memberships (id, org_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)',
      newId('mem'), orgId, userId, 'owner', timestamp,
    );

    bootstrapOrganization(orgId);

    return {
      user: db.get<UserRow>('SELECT * FROM users WHERE id = ?', userId)!,
      org: db.get<OrganizationRow>('SELECT * FROM organizations WHERE id = ?', orgId)!,
    };
  });
}

export async function authenticate(email: string, password: string): Promise<{ user: UserRow; org: OrganizationRow }> {
  const user = findUserByEmail(email);
  // Always run a hash comparison so a missing account and a wrong password cost the same.
  const stored = user?.password_hash ?? 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA';
  const ok = await verifyPassword(password, stored);
  if (!user || !ok) throw new AuthError('invalid_credentials', 'אימייל או סיסמה שגויים');

  const org = getDb().get<OrganizationRow>(
    `SELECT o.* FROM organizations o
       JOIN memberships m ON m.org_id = o.id
      WHERE m.user_id = ? ORDER BY m.created_at ASC LIMIT 1`,
    user.id,
  );
  if (!org) throw new AuthError('invalid_credentials', 'לא נמצא ארגון עבור המשתמש');

  getDb().run('UPDATE users SET last_login_at = ? WHERE id = ?', nowIso(), user.id);
  return { user, org };
}

export function markOnboarded(orgId: string): void {
  getDb().run('UPDATE organizations SET onboarded_at = ? WHERE id = ? AND onboarded_at IS NULL', nowIso(), orgId);
}

export function orgStats(orgId: string) {
  return {
    candidates: repos.candidates.count(orgId),
    jobs: repos.jobs.count(orgId),
    clients: repos.clients.count(orgId),
  };
}
