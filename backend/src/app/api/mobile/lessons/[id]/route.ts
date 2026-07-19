import { NextResponse } from 'next/server';
import { getBearerToken, createClientFromToken } from '@/../../lib/supabase/bearer';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'unauthorized', message: 'Missing token.' }, { status: 401 });

  const supabase = createClientFromToken(token);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'unauthorized', message: 'Invalid token.' }, { status: 401 });

  const { id } = await params;
  const { data, error } = await supabase
    .from('lessons')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return NextResponse.json({ error: 'not_found', message: 'Lesson not found.' }, { status: 404 });
  return NextResponse.json(data);
}
