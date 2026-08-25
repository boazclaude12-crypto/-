import { cookies } from 'next/headers';
import { destroySession, SESSION_COOKIE } from '@/lib/auth/session';
import { json, withPublic } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withPublic(async () => {
  const store = await cookies();
  destroySession(store.get(SESSION_COOKIE)?.value);
  store.delete(SESSION_COOKIE);
  return json({ ok: true });
});
