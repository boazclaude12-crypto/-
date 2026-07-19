import { NextResponse } from 'next/server';
import { getBearerToken, createClientFromToken } from '../../../../../lib/supabase/bearer';

export async function GET(request: Request) {
  const token = getBearerToken(request);
  if (!token)
    return NextResponse.json({ error: 'unauthorized', message: 'Missing Bearer token' }, { status: 401 });

  const supabase = createClientFromToken(token);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user)
    return NextResponse.json({ error: 'unauthorized', message: 'Invalid or expired token' }, { status: 401 });

  return NextResponse.json({
    id: user.id,
    email: user.email ?? '',
    created_at: user.created_at,
  });
}
