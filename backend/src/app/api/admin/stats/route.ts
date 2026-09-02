import { NextResponse } from 'next/server';
import supabaseAdmin from '../../../../../lib/supabase/supabaseAdmin';
import { requireAdmin } from '@lib/supabase/adminAuth';

export async function GET(request: Request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  
  try {
    // Get summary statistics in parallel
    const [
      usersCount,
      requestsCount,
      paymentsData,
      activeUsersData,
      plansData,
    ] = await Promise.all([
      supabaseAdmin.from('user_profiles').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('user_requests').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('payment_attempts').select('amount, status'),
      supabaseAdmin.from('user_profiles').select('user_id, plan_id').eq('recurring_is_active', true),
      supabaseAdmin.from('plans').select('id, price, is_monthly'),
    ]);
    
    // Calculate total successful payment amount
    const totalPayments = paymentsData.data
      ?.filter(payment => payment.status === 'success')
      .reduce((sum, payment) => sum + (payment.amount || 0), 0) || 0;
    
    // Count active users (users with non-free subscription)
    const activeUsers = activeUsersData.data?.length || 0;
    
    // Calculate MRR (Monthly Recurring Revenue)
    let mrr = 0;
    
    // Create a map of plan ID to price for faster lookups
    const plansMap = new Map();
    if (plansData.data) {
      plansData.data.forEach(plan => {
        // Only include monthly plans in MRR calculation
        if (plan.is_monthly) {
          plansMap.set(plan.id, plan.price);
        } else {
          // For non-monthly plans (e.g. annual), divide by 12 to get monthly equivalent
          plansMap.set(plan.id, plan.price / 12);
        }
      });
    }
    
    // Calculate MRR by summing the prices of plans for all active users
    if (activeUsersData.data) {
      activeUsersData.data.forEach(user => {
        const planPrice = plansMap.get(user.plan_id) || 0;
        mrr += planPrice;
      });
    }
    
    return NextResponse.json({
      users: usersCount.count || 0,
      requests: requestsCount.count || 0,
      payments: totalPayments,
      activeUsers: activeUsers,
      mrr: Math.round(mrr)  // Round to nearest integer for display
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json({ error: 'Failed to fetch statistics' }, { status: 500 });
  }
}
