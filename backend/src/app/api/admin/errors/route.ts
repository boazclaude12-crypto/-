import { NextResponse } from 'next/server';
import supabaseAdmin from '../../../../../lib/supabase/supabaseAdmin';
import { requireAdmin } from '@lib/supabase/adminAuth';

export async function GET(request: Request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const pageSize = parseInt(url.searchParams.get('pageSize') || '10');
  const offset = (page - 1) * pageSize;
  
  try {
    // Get error logs with pagination - fetch all fields without the join
    const { data: errorsData, error } = await supabaseAdmin
      .from('payment_errors')
      .select('*')
      .range(offset, offset + pageSize - 1)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    // Get total count for pagination
    const { count, error: countError } = await supabaseAdmin
      .from('payment_errors')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      console.error('Error counting errors:', countError);
    }
    
    const totalCount = count || 0;
    
    // Process each error log to fetch user profiles and emails
    const errorsWithUserDetails = await Promise.all((errorsData || []).map(async (errorLog) => {
      let enrichedErrorLog = { ...errorLog };
      
      // If there's a user_id, fetch the profile separately
      if (errorLog.user_id) {
        try {
          // Fetch user profile
          const { data: profileData } = await supabaseAdmin
            .from('user_profiles')
            .select('*')
            .eq('user_id', errorLog.user_id)
            .single();
          
          if (profileData) {
            enrichedErrorLog.user_profiles = profileData;
          }
          
          // Fetch user email from auth table
          const { data: userResponse, error: userError } = await supabaseAdmin.auth.admin.getUserById(errorLog.user_id);
          
          if (userError || !userResponse || !userResponse.user) {
            console.error(`Error fetching user email for user_id ${errorLog.user_id}:`, userError);
          } else {
            // Add user email to error log
            enrichedErrorLog.user_email = userResponse.user.email;
          }
        } catch (error) {
          console.error(`Unexpected error for user_id ${errorLog.user_id}:`, error);
        }
      }
      
      return enrichedErrorLog;
    }));
    
    return NextResponse.json({ 
      errors: errorsWithUserDetails || [],
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize)
    });
  } catch (error) {
    console.error('Error fetching error logs:', error);
    // Check if table doesn't exist
    const isTableNotFound = error instanceof Error && error.message.includes('relation "payment_errors" does not exist');
    
    return NextResponse.json({ 
      errors: [],
      totalCount: 0,
      page,
      pageSize,
      totalPages: 0,
      tableNotFound: isTableNotFound 
    });
  }
} 