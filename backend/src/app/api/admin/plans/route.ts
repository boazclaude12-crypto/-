import { NextRequest, NextResponse } from 'next/server';
import supabaseAdmin from '../../../../../lib/supabase/supabaseAdmin';
import { requireAdmin } from '@lib/supabase/adminAuth';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  // Fetch plans
  const { data, error } = await supabaseAdmin.from('plans').select('*');
  if (error) {
    return NextResponse.json({ error: 'Failed to fetch plans' }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  // Update plan
  const body = await request.json();
  const { id, name, price, daily_limit, is_monthly, features, daily_chat_limit } = body;
  const { error } = await supabaseAdmin.from('plans').update({ 
    name, 
    price, 
    daily_limit, 
    is_monthly, 
    features, 
    daily_chat_limit 
  }).eq('id', id);
  
  if (error) {
    return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 });
  }
  return NextResponse.json({ message: 'Plan updated successfully' });
}
  