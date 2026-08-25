import { cookies } from 'next/headers';
import { loginSchema } from '@/lib/schemas';
import { AuthError, authenticate } from '@/lib/auth/service';
import { createSession, sessionCookieOptions, SESSION_COOKIE } from '@/lib/auth/session';
import { ApiError, clientIp, json, parseBody, withPublic } from '@/lib/http';
import { checkRateLimit, clearRateLimit } from '@/lib/rate-limit';
import { requestMeta } from '@/lib/auth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withPublic(async (request) => {
  const input = await parseBody(request, loginSchema);
  const ip = await clientIp();

  // Two buckets: one per address (credential stuffing) and one per IP (brute force).
  const perEmail = checkRateLimit(`login:email:${input.email}`, 8, 15 * 60_000);
  const perIp = checkRateLimit(`login:ip:${ip}`, 25, 15 * 60_000);
  if (!perEmail.allowed || !perIp.allowed) {
    throw new ApiError(429, 'יותר מדי ניסיונות התחברות. נסה שוב בעוד מספר דקות.');
  }

  try {
    const { user, org } = await authenticate(input.email, input.password);
    clearRateLimit(`login:email:${input.email}`);

    const meta = await requestMeta();
    const session = createSession(user.id, org.id, meta);
    const store = await cookies();
    store.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));

    return json({ user: { id: user.id, name: user.name, email: user.email }, org: { id: org.id, name: org.name } });
  } catch (error) {
    if (error instanceof AuthError) throw new ApiError(401, error.message);
    throw error;
  }
});
