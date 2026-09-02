import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@lib/supabase/adminAuth';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// PUT endpoint to update user details
export async function PUT(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    // Get user ID from URL
    const userId = request.url.split('/users/')[1].split('/')[0];
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Get request body
    const userData = await request.json();
    
    // Extract only the fields that should be updated in user_profiles
    const {
      name,
      avatar_url,
      plan_id,
      userPersonalId,
      cardcom_account_id,
      cardcom_low_profile_id,
      recurring_is_active,
      last_bill_date,
      disable_date,
      recurring_id,
      discount_code_id,
      cancellation_discount_used,
      cancellation_discount_date,
      cancellation_reason,
      cancellation_date,
      discount_percent
    } = userData;

    // Update user profile in Supabase
    const { data, error } = await getSupabase()
      .from('user_profiles')
      .update({
        name,
        avatar_url,
        plan_id,
        userPersonalId,
        cardcom_account_id,
        cardcom_low_profile_id,
        recurring_is_active,
        last_bill_date,
        disable_date,
        recurring_id,
        discount_code_id,
        cancellation_discount_used,
        cancellation_discount_date,
        cancellation_reason,
        cancellation_date,
        discount_percent
      })
      .eq('user_id', userId)
      .select();

    if (error) {
      console.error('Error updating user profile:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      message: 'User profile updated successfully', 
      data 
    });
  } catch (error) {
    console.error('Error in PUT /api/admin/users/[userId]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 