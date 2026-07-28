import { NextResponse } from 'next/server';
import { getBearerToken, createClientFromToken } from '@lib/supabase/bearer';
import supabaseAdmin from '@lib/supabase/supabaseAdmin';

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

  // TODO: verify receipt with Apple/Google servers before trusting it

  // Look up the pro plan id so we can set plan_id correctly
  const { data: proPlan } = await supabaseAdmin
    .from('plans')
    .select('id, daily_limit')
    .ilike('name', '%pro%')
    .order('id', { ascending: true })
    .limit(1)
    .single();

  const disableDate = new Date();
  disableDate.setMonth(disableDate.getMonth() + 1);

  const upsertData: Record<string, unknown> = {
    user_id: user.id,
    iap_receipt: body.receipt,
    iap_platform: body.platform,
    last_bill_date: new Date().toISOString(),
    disable_date: disableDate.toISOString(),
    recurring_is_active: true,
  };
  if (proPlan) upsertData.plan_id = proPlan.id;

  const { error } = await supabaseAdmin
    .from('user_profiles')
    .upsert(upsertData);

  if (error) return NextResponse.json({ error: 'db_error', message: error.message }, { status: 500 });

  const dailyLimit = proPlan?.daily_limit ?? 10;
  const resets = new Date();
  resets.setDate(resets.getDate() + 1);
  resets.setHours(0, 0, 0, 0);

  return NextResponse.json({
    tier: 'pro',
    active: true,
    source: body.platform === 'ios' ? 'ios_iap' : 'android_iap',
    daily_limit: dailyLimit,
    used_today: 0,
    resets_at: resets.toISOString(),
    expires_at: disableDate.toISOString(),
  });
}
