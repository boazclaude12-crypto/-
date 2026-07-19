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

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('page_size') ?? '10')));
  const from = (page - 1) * pageSize;

  const { data: rows, error, count } = await supabase
    .from('analyses')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);

  if (error)
    return NextResponse.json({ error: 'db_error', message: error.message }, { status: 500 });

  const total = count ?? 0;

  return NextResponse.json({
    items: (rows ?? []).map(mapAnalysis),
    page,
    page_size: pageSize,
    total,
    has_more: from + pageSize < total,
  });
}

function mapAnalysis(row: any) {
  return {
    id: row.id,
    created_at: row.created_at,
    image_url: row.image ?? '',
    symbol: row.asset_name ?? null,
    type: row.type ?? 'crypto',
    explanation: row.analysis ?? '',
  };
}
