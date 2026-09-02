import { NextResponse } from 'next/server';
import { getBearerToken, createClientFromToken } from './bearer';
import supabaseAdmin from './supabaseAdmin';

export type AdminGuard =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

function deny(status: number, error: string, message: string): AdminGuard {
  return { ok: false, response: NextResponse.json({ error, message }, { status }) };
}

/**
 * Gate an admin route. Verifies the caller's Supabase access token and checks
 * the `is_admin` flag on their profile, which only the service role can set.
 *
 * Routes must return `guard.response` when `ok` is false — the previous shared
 * password lived in a NEXT_PUBLIC_ variable, so it shipped inside the browser
 * bundle and gated nothing.
 */
export async function requireAdmin(request: Request): Promise<AdminGuard> {
  const token = getBearerToken(request);
  if (!token) return deny(401, 'unauthorized', 'Missing token.');

  const { data: { user }, error } = await createClientFromToken(token).auth.getUser();
  if (error || !user) return deny(401, 'unauthorized', 'Invalid token.');

  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('is_admin')
    .eq('user_id', user.id)
    .single();

  if (!profile?.is_admin) return deny(403, 'forbidden', 'Admin access required.');

  return { ok: true, userId: user.id };
}
