import { NextResponse } from 'next/server';
import supabaseAdmin from '../../../../../lib/supabase/supabaseAdmin';

export async function GET(request: Request) {
  const adminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD;
  const authHeader = request.headers.get('authorization');
  
  // Check admin password from header
  if (!authHeader || authHeader !== `Bearer ${adminPassword}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const pageSize = parseInt(url.searchParams.get('pageSize') || '10');
  const offset = (page - 1) * pageSize;
  
  try {
    // Fetch user profiles with pagination
    const { data: usersData, error: usersError } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .range(offset, offset + pageSize - 1)
      .order('created_at', { ascending: false });
    
    if (usersError) throw usersError;
    
    // Fetch emails and chats for each user
    const usersWithDetails = await Promise.all((usersData || []).map(async (user) => {
      let enrichedUser = { ...user };
      
      try {
        // Fetch user email from auth table
        const { data: userResponse, error: userError } = await supabaseAdmin.auth.admin.getUserById(user.user_id);
        
        if (userError || !userResponse || !userResponse.user) {
          console.error(`Error fetching user email for user_id ${user.user_id}:`, userError);
        } else {
          enrichedUser.email = userResponse.user.email;
        }
        
        // Fetch user chats
        const { data: chatsData, error: chatsError } = await supabaseAdmin
          .from('chats')
          .select('*')
          .eq('user_id', user.user_id);
        
        if (chatsError) {
          console.error(`Error fetching chats for user_id ${user.user_id}:`, chatsError);
        } else {
          enrichedUser.chats = chatsData || [];
        }
      } catch (error) {
        console.error(`Unexpected error for user_id ${user.user_id}:`, error);
      }
      
      return enrichedUser;
    }));
    
    // Get total count for pagination
    const { count, error: countError } = await supabaseAdmin
      .from('user_profiles')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      console.error('Error counting users:', countError);
    }
    
    const totalCount = count || 0;
    
    return NextResponse.json({ 
      users: usersWithDetails || [],
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize)
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
} 