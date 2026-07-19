import { NextResponse } from 'next/server';
import { getBearerToken, createClientFromToken } from '../../../../../lib/supabase/bearer';

export async function GET(request: Request) {
  const token = getBearerToken(request);
  if (!token)
    return NextResponse.json({ error: 'unauthorized', message: 'Missing Bearer token' }, { status: 401 });

  const supabase = createClientFromToken(token);
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user)
    return NextResponse.json({ error: 'unauthorized', message: 'Invalid token' }, { status: 401 });

  // Fetch user's plan
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('plan_id, disable_date')
    .eq('user_id', user.id)
    .single();

  if (!profile?.plan_id) {
    // Return free-tier defaults
    return NextResponse.json({
      tier: 'free',
      active: false,
      source: 'none',
      daily_limit: 3,
      used_today: 0,
      resets_at: nextMidnightIsrael(),
      expires_at: null,
    });
  }

  const { data: plan } = await supabase
    .from('plans')
    .select('id, name, daily_limit')
    .eq('id', profile.plan_id)
    .single();

  // Count today's requests (Israel timezone)
  const israelMidnight = israelMidnightISO();
  const { data: recentRequests } = await supabase
    .from('user_requests')
    .select('id')
    .eq('user_id', user.id)
    .gte('created_at', israelMidnight);

  const usedToday = recentRequests?.length ?? 0;
  const dailyLimit = plan?.daily_limit ?? 3;
  const tier = resolveTier(plan?.name ?? '');
  const active = profile.disable_date ? new Date(profile.disable_date) > new Date() : true;

  return NextResponse.json({
    tier,
    active,
    source: 'web',
    daily_limit: dailyLimit,
    used_today: usedToday,
    resets_at: nextMidnightIsrael(),
    expires_at: profile.disable_date ?? null,
  });
}

function israelMidnightISO(): string {
  const now = new Date();
  const il = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  il.setHours(0, 0, 0, 0);
  return il.toISOString();
}

function nextMidnightIsrael(): string {
  const now = new Date();
  const il = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  il.setHours(24, 0, 0, 0);
  return il.toISOString();
}

function resolveTier(planName: string): 'free' | 'pro' | 'premium' {
  const n = planName.toLowerCase();
  if (n.includes('premium')) return 'premium';
  if (n.includes('pro')) return 'pro';
  return 'free';
}
