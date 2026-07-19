import { NextResponse } from 'next/server';
import { getBearerToken, createClientFromToken } from '@/../../../../lib/supabase/bearer';

export async function POST(request: Request) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'unauthorized', message: 'Missing token.' }, { status: 401 });

  const supabase = createClientFromToken(token);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'unauthorized', message: 'Invalid token.' }, { status: 401 });

  const body = await request.json();
  if (!body?.receipt) {
    return NextResponse.json({ error: 'invalid_receipt', message: 'A store receipt is required.' }, { status: 400 });
  }

  // TODO: verify receipt with Apple/Google servers
  // For now, mark subscription active in user_profiles
  const { error } = await supabase
    .from('user_profiles')
    .upsert({
      user_id: user.id,
      plan: body.platform === 'ios' ? 'pro' : 'pro',
      iap_receipt: body.receipt,
      iap_platform: body.platform,
    });

  if (error) return NextResponse.json({ error: 'db_error', message: error.message }, { status: 500 });

  const end = new Date();
  end.setMonth(end.getMonth() + 1);

  return NextResponse.json({
    tier: 'pro',
    active: true,
    source: body.platform === 'ios' ? 'ios_iap' : 'android_iap',
    daily_limit: 10,
    used_today: 0,
    resets_at: new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())).toISOString(),
    expires_at: end.toISOString(),
  });
}
