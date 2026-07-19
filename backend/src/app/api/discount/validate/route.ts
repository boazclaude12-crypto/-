import { NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { code } = await req.json();

    if (!code) {
      return NextResponse.json({ valid: false, error: "No discount code provided" }, { status: 400 });
    }

    // Check if the discount code exists in the database and is active
    const { data: discount, error } = await supabase
      .from("discount_codes")
      .select("code, is_active, expires_at, first_month_only")
      .eq("code", code)
      .single();

    if (error || !discount) {
      return NextResponse.json({ valid: false, error: "Invalid discount code" }, { status: 404 });
    }

    // Check expiration date
    if (discount.expires_at && new Date(discount.expires_at) < new Date()) {
      return NextResponse.json({ valid: false, error: "Discount code expired" }, { status: 400 });
    }

    return NextResponse.json({ valid: true, firstMonthOnly: discount.first_month_only });
  } catch (error: any) {
    return NextResponse.json({ valid: false, error: "Server error" }, { status: 500 });
  }
}
