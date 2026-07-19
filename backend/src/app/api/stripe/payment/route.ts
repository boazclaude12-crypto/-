import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { createClient } from '../../../../../lib/supabase/server';

export async function POST(request: NextRequest) {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: "לא מחובר" }, { status: 401 });
  
      const { planId } = await request.json();
  
      // Fetch the plan details
      const { data: plan } = await supabase
        .from("plans")
        .select("payment_link")
        .eq("id", planId)
        .single();
      if (!plan) return NextResponse.json({ error: "תכנית לא נמצאה" }, { status: 403 });
    
      return NextResponse.json({
        success: true,
        redirectUrl: plan.payment_link + "?prefilled_email=" + user.email,
      });
    } catch (error:any) {
      console.error("Error in Stripe API request:", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
  }
  