import { createClient } from '@supabase/supabase-js';

/** Extract the raw Bearer token from the Authorization header, or null. */
export function getBearerToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * Create a Supabase client authenticated as the user identified by the given
 * access token. Passes the token in every request header so Supabase RLS
 * policies are applied correctly – no service-role bypass.
 */
export function createClientFromToken(accessToken: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  );
}
