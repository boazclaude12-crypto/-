import { NextResponse } from 'next/server';
import { getBearerToken, createClientFromToken } from '@lib/supabase/bearer';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = getBearerToken(request);
  if (!token)
    return NextResponse.json({ error: 'unauthorized', message: 'Missing Bearer token' }, { status: 401 });

  const supabase = createClientFromToken(token);
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user)
    return NextResponse.json({ error: 'unauthorized', message: 'Invalid token' }, { status: 401 });

  const { data: row, error } = await supabase
    .from('analyses')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !row)
    return NextResponse.json({ error: 'not_found', message: 'Analysis not found' }, { status: 404 });

  return NextResponse.json({
    id: row.id,
    created_at: row.created_at,
    image_url: row.image ?? '',
    symbol: row.asset_name ?? null,
    type: row.type ?? 'crypto',
    explanation: row.analysis ?? '',
  });
}
