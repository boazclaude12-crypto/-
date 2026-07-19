import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // שליפת מגבלת היומית של המשתמש
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("plan_id")
    .eq("user_id", user.id)
    .single();

  if (!profile?.plan_id) return NextResponse.json({ error: "No plan found" }, { status: 403 });

  const { data: plan } = await supabase
    .from("plans")
    .select("daily_limit")
    .eq("id", profile.plan_id)
    .single();

  // ספירת הבקשות האחרונות מתחילת היום (00:00) לפי שעון ישראל
  // Use Israel timezone (UTC+3/UTC+2)
  const now = new Date();
  const israelTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  israelTime.setHours(0, 0, 0, 0); // Set to midnight of the current day in Israel time
  
  const { data: recentRequests } = await supabase
    .from("user_requests")
    .select("id")
    .eq("user_id", user.id)
    .gte("created_at", israelTime.toISOString());

  const requestsLeft = plan?.daily_limit - (recentRequests?.length || 0);
  return NextResponse.json({ requestsLeft });
}
