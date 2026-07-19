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
    .select("daily_chat_limit")
    .eq("id", profile.plan_id)
    .single();

  // ספירת הבקשות האחרונות ב-24 שעות
  const { data: recentRequests } = await supabase
    .from("chats")
    .select("*")
    .eq("user_id", user.id)
    .eq('message_type', 'user')
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  if(recentRequests)
  {
    const requestsLeft = plan?.daily_chat_limit - (recentRequests.length || 0);
    return NextResponse.json({ requestsLeft });
  }
  else{
    return NextResponse.json({requestsLeft:0 });
  }
}
