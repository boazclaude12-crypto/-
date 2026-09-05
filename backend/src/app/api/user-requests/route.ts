import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { getEntitlement, getUsedToday } from "../../../../lib/subscription";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Same entitlement rules the analysis route enforces, so the quota shown
  // always matches the quota applied. This previously 403'd when a profile had
  // no plan, which a trial account legitimately can.
  const entitlement = await getEntitlement(supabase, user.id);
  const usedToday = await getUsedToday(supabase, user.id);

  return NextResponse.json({
    requestsLeft: Math.max(0, entitlement.dailyLimit - usedToday),
    dailyLimit: entitlement.dailyLimit,
    used: usedToday,
    planName: entitlement.planName,
    active: entitlement.active,
    expired: entitlement.expired,
    expiresAt: entitlement.expiresAt,
  });
}
