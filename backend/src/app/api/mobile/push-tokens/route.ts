import { NextResponse } from 'next/server';
import { getBearerToken, createClientFromToken } from '@lib/supabase/bearer';

export async function POST(request: Request) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'unauthorized', message: 'Missing token.' }, { status: 401 });

  const supabase = createClientFromToken(token);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'unauthorized', message: 'Invalid token.' }, { status: 401 });

  const body = await request.json();
  if (!body?.token) {
    return NextResponse.json({ error: 'missing_token', message: 'Push token is required.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('push_tokens')
    .upsert({
      user_id: user.id,
      token: body.token,
      platform: body.platform ?? 'unknown',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,token' });

  if (error) {
    // Table might not exist yet — fail gracefully so app keeps working
    console.error('push_tokens upsert error:', error.message);
    return NextResponse.json({ registered: false, message: error.message }, { status: 200 });
  }

  return NextResponse.json({ registered: true });
}
