import { NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await createClient();
  let user: any = null;
  
  try {
    console.log('Recording subscription cancellation');
    const { data: { user: userData } } = await supabase.auth.getUser();
    user = userData;
    
    if (!user) {
      console.log('Unauthorized - no user found');
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get request data
    const { reason, plan_id } = await req.json();
    
    if (!reason) {
      return NextResponse.json({ error: "Cancellation reason is required" }, { status: 400 });
    }

    // Get user profile for any additional needed data
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("disable_date")
      .eq("user_id", user.id)
      .single();

    const now = new Date().toISOString();

    // Insert into subscription_cancellations table with correct columns
    const { data, error } = await supabase
      .from('subscription_cancellations')
      .insert({
        user_id: user.id,
        plan_id: plan_id,
        reason: reason,
        cancellation_date: now,
        effective_date: profile?.disable_date || null,
        created_at: now
      });

    if (error) {
      console.error('Error recording cancellation:', error);
      
      await supabase.from('payment_errors').insert({
        user_id: user.id,
        error_message: error.message,
        error_code: 'cancellation_record_error',
        metadata: {
          reason,
          plan_id,
          error
        }
      });
      
      return NextResponse.json({ error: "Failed to record cancellation reason" }, { status: 500 });
    }

    // Log successful operation
    await supabase.from('payment_logs').insert({
      user_id: user.id,
      operation: 'subscription_cancellation_logged',
      status: 'success',
      metadata: {
        reason,
        plan_id
      }
    });

    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('Error in subscription cancellation:', error);
    
    await supabase.from('payment_errors').insert({
      user_id: user?.id,
      error_message: error instanceof Error ? error.message : 'Unknown error',
      error_code: 'unhandled_cancellation_error',
      metadata: {
        error_stack: error instanceof Error ? error.stack : undefined,
        error_details: error
      }
    });
    
    return NextResponse.json({ 
      error: "Failed to process cancellation",
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
