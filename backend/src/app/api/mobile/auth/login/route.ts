import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password)
      return NextResponse.json({ error: 'missing_fields', message: 'Email and password are required' }, { status: 400 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error)
      return NextResponse.json({ error: 'auth_error', message: error.message }, { status: 401 });

    return NextResponse.json({
      token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: {
        id: data.user.id,
        email: data.user.email ?? email,
        created_at: data.user.created_at,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: 'internal_error', message: e.message }, { status: 500 });
  }
}
