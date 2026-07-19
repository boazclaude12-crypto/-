import { NextResponse } from 'next/server';
import supabaseAdmin from '../../../../../../../lib/supabase/supabaseAdmin';

export async function GET(
  request: Request
) {
  const { pathname } = new URL(request.url);
  const userId = pathname.split('/').pop();
  const adminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD;
  const authHeader = request.headers.get('authorization');
  
  // Check admin password from header
  if (!authHeader || authHeader !== `Bearer ${adminPassword}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  if (!userId) {
    return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
  }
  
  try {
    // Fetch chats for the specific user
    const { data: chatsData, error: chatsError } = await supabaseAdmin
      .from('chats')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50); // Limit to last 50 chats for performance
    
    if (chatsError) {
      console.error(`Error fetching chats for user_id ${userId}:`, chatsError);
      return NextResponse.json({ error: 'Failed to fetch chat history' }, { status: 500 });
    }
    
    return NextResponse.json({ 
      chats: chatsData || [] 
    });
  } catch (error) {
    console.error(`Error in GET /api/admin/users/${userId}/chats:`, error);
    return NextResponse.json({ error: 'Failed to fetch chat history' }, { status: 500 });
  }
} 