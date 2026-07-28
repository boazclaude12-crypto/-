import { NextResponse } from 'next/server';
import { getBearerToken, createClientFromToken } from '@lib/supabase/bearer';

export async function GET(request: Request) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'unauthorized', message: 'Missing token.' }, { status: 401 });

  const supabase = createClientFromToken(token);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'unauthorized', message: 'Invalid token.' }, { status: 401 });

  const { data, error } = await supabase
    .from('lessons')
    .select('id, title, summary, image_url, duration_minutes, order')
    .order('order', { ascending: true });

  if (error) return NextResponse.json({ error: 'db_error', message: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
