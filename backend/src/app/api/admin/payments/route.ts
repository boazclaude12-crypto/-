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
    // Get payments with pagination
    const { data: paymentsData, error } = await supabaseAdmin
      .from('payment_attempts')
      .select(`
        *,
        user_profiles(name)
      `)
      .range(offset, offset + pageSize - 1)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    if (!paymentsData) {
      return NextResponse.json({
        payments: [],
        totalCount: 0,
        page,
        pageSize,
        totalPages: 0
      });
    }
    
    // Fetch emails using admin API
    const paymentsWithEmails = await Promise.all(paymentsData.map(async (payment) => {
      try {
        const { data: userResponse, error: userError } = await supabaseAdmin.auth.admin.getUserById(payment.user_id);
        
        if (userError || !userResponse || !userResponse.user) {
          console.error(`Error fetching user email for user_id ${payment.user_id}:`, userError);
          // Return payment with explicit email field for frontend
          return { 
            ...payment,
            email: null,
            user_display: payment.user_id // Fallback to ID
          };
        }
        
        // Return payment with email and a display field for frontend
        return { 
          ...payment,
          email: userResponse.user.email,
          user_display: userResponse.user.email // This is what will be shown in the UI
        };
      } catch (error) {
        console.error(`Unexpected error for user_id ${payment.user_id}:`, error);
        return { 
          ...payment, 
          email: null,
          user_display: payment.user_id // Fallback to ID
        };
      }
    }));
    
    // Get the total count of payment records for proper pagination
    const { data: countData, error: countError } = await supabaseAdmin
      .from('payment_attempts')
      .select('id', { count: 'exact', head: true });
      
    const totalCount = countData?.length || 0;
    
    if (countError) {
      console.error('Error counting payments:', countError);
    }
    
    return NextResponse.json({
      payments: paymentsWithEmails,
      totalCount: totalCount || paymentsData.length,
      page,
      pageSize, 
      totalPages: Math.ceil((totalCount || paymentsData.length) / pageSize)
    });
    
  } catch (error) {
    console.error('Error fetching payments:', error);
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 });
  }
}

// Example API route for fetching users with email
const fetchUsersWithEmail = async () => {  
  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .select(`
      user_id,
      name,
      plan_id,
      auth.users(email)
    `);

  if (error) {
    console.error('Error fetching users with email:', error);
    return [];
  }

  return data;
};

// Example logic for calculating active users and income
const calculateStats = async () => {

  const { data: usersData, error: usersError } = await supabaseAdmin
    .from('user_profiles')
    .select('user_id, recurring_is_active, plan_id')
    .eq('recurring_is_active', true)
    .neq('plan_id', null);

  const { data: paymentsData, error: paymentsError } = await supabaseAdmin
    .from('payment_attempts')
    .select('amount, status')
    .eq('status', 'succeeded');

  if (usersError || paymentsError) {
    console.error('Error fetching stats:', usersError || paymentsError);
    return { activeUsers: 0, totalIncome: 0 };
  }

  const activeUsers = usersData.length;
  const totalIncome = paymentsData.reduce((sum, payment) => sum + payment.amount, 0);

  return { activeUsers, totalIncome };
};