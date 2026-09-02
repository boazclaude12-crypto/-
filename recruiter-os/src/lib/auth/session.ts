import { createHmac, timingSafeEqual } from 'node:crypto';
import { getDb } from '../db/index';
import { newId, newToken } from '../ids';
import { env } from '../env';
import { DAY, nowIso, isoPlus } from '../time';

export const SESSION_COOKIE = 'ros_session';
export const SESSION_TTL_MS = 30 * DAY;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  locale: string;
}

export interface SessionOrg {
  id: string;
  name: string;
  currency: string;
  onboardedAt: string | null;
}

export interface AuthContext {
  sessionId: string;
  user: SessionUser;
  org: SessionOrg;
}

/** Cookies hold a raw token; the database only ever stores its HMAC. */
function fingerprint(token: string): string {
  return createHmac('sha256', env.authSecret).update(token).digest('base64url');
}

export function createSession(
  userId: string,
  orgId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): { token: string; expiresAt: string } {
  const token = newToken(32);
  const expiresAt = isoPlus(SESSION_TTL_MS);
  getDb().run(
    `INSERT INTO sessions (id, user_id, org_id, token_hash, created_at, expires_at, last_seen_at, user_agent, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    newId('ses'),
    userId,
    orgId,
    fingerprint(token),
    nowIso(),
    expiresAt,
    nowIso(),
    meta.userAgent?.slice(0, 300) ?? null,
    meta.ip?.slice(0, 60) ?? null,
  );
  return { token, expiresAt };
}

interface SessionRow {
  session_id: string;
  expires_at: string;
  user_id: string;
  email: string;
  name: string;
  locale: string;
  org_id: string;
  org_name: string;
  currency: string;
  onboarded_at: string | null;
}

export function resolveSession(token: string | undefined | null): AuthContext | null {
  if (!token) return null;
  const db = getDb();
  const row = db.get<SessionRow>(
    `SELECT s.id AS session_id, s.expires_at, u.id AS user_id, u.email, u.name, u.locale,
            o.id AS org_id, o.name AS org_name, o.currency, o.onboarded_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN organizations o ON o.id = s.org_id
      WHERE s.token_hash = ?`,
    fingerprint(token),
  );
  if (!row) return null;

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.run('DELETE FROM sessions WHERE id = ?', row.session_id);
    return null;
  }

  return {
    sessionId: row.session_id,
    user: { id: row.user_id, email: row.email, name: row.name, locale: row.locale },
    org: {
      id: row.org_id,
      name: row.org_name,
      currency: row.currency,
      onboardedAt: row.onboarded_at,
    },
  };
}

export function touchSession(sessionId: string): void {
  getDb().run('UPDATE sessions SET last_seen_at = ? WHERE id = ?', nowIso(), sessionId);
}

export function destroySession(token: string | undefined | null): void {
  if (!token) return;
  getDb().run('DELETE FROM sessions WHERE token_hash = ?', fingerprint(token));
}

export function destroyAllSessionsForUser(userId: string): void {
  getDb().run('DELETE FROM sessions WHERE user_id = ?', userId);
}

export function purgeExpiredSessions(): number {
  return getDb().run('DELETE FROM sessions WHERE expires_at <= ?', nowIso()).changes;
}

/** Constant-time compare used by CSRF-ish double-submit checks. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function sessionCookieOptions(expiresAt: string) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.isProduction,
    path: '/',
    expires: new Date(expiresAt),
  };
}
