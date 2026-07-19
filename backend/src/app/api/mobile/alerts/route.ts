import { NextResponse } from 'next/server';
import { getBearerToken, createClientFromToken } from '@/../../lib/supabase/bearer';

export async function GET(request: Request) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'unauthorized', message: 'Missing token.' }, { status: 401 });

  const supabase = createClientFromToken(token);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'unauthorized', message: 'Invalid token.' }, { status: 401 });

  const { data, error } = await supabase
    .from('price_alerts')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'db_error', message: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'unauthorized', message: 'Missing token.' }, { status: 401 });

  const supabase = createClientFromToken(token);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'unauthorized', message: 'Invalid token.' }, { status: 401 });

  const body = await request.json();
  const { symbol, direction, threshold_percent, timeframe } = body;
  if (!symbol || !direction) {
    return NextResponse.json({ error: 'invalid_request', message: 'symbol and direction are required.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('price_alerts')
    .insert({
      user_id: user.id,
      symbol,
      direction,
      threshold_percent: Number(threshold_percent) || 5,
      timeframe: timeframe ?? '24h',
      active: true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'db_error', message: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
