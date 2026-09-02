import 'server-only';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { resolveSession, SESSION_COOKIE, type AuthContext } from './session';

/** Reads the session cookie. Returns null for anonymous visitors. */
export async function getAuth(): Promise<AuthContext | null> {
  const store = await cookies();
  return resolveSession(store.get(SESSION_COOKIE)?.value);
}

/** For pages: sends anonymous visitors to the login screen. */
export async function requireAuth(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) redirect('/login');
  return auth;
}

export async function requestMeta(): Promise<{ userAgent: string | null; ip: string | null }> {
  const list = await headers();
  const forwarded = list.get('x-forwarded-for');
  return {
    userAgent: list.get('user-agent'),
    ip: forwarded ? forwarded.split(',')[0]!.trim() : list.get('x-real-ip'),
  };
}
