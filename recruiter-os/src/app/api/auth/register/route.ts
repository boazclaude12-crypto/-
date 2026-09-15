import { cookies } from 'next/headers';
import { registerSchema } from '@/lib/schemas';
import { AuthError, registerUser } from '@/lib/auth/service';
import { createSession, sessionCookieOptions, SESSION_COOKIE } from '@/lib/auth/session';
import { passwordProblems } from '@/lib/auth/password';
import { ApiError, clientIp, json, parseBody, withPublic } from '@/lib/http';
import { checkRateLimit } from '@/lib/rate-limit';
import { requestMeta } from '@/lib/auth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withPublic(async (request) => {
  const ip = await clientIp();
  const limit = checkRateLimit(`register:${ip}`, 5, 60 * 60_000);
  if (!limit.allowed) throw new ApiError(429, 'יותר מדי ניסיונות הרשמה. נסה שוב בעוד שעה.');

  const input = await parseBody(request, registerSchema);
  const problems = passwordProblems(input.password);
  if (problems.length) throw new ApiError(422, problems.join(', '));

  try {
    const { user, org } = await registerUser({
      name: input.name,
      email: input.email,
      password: input.password,
      orgName: input.orgName ?? undefined,
    });

    const meta = await requestMeta();
    const session = createSession(user.id, org.id, meta);
    const store = await cookies();
    store.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));

    return json({ user: { id: user.id, name: user.name, email: user.email }, org: { id: org.id, name: org.name } }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) throw new ApiError(409, error.message);
    throw error;
  }
});
