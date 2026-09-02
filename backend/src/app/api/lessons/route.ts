import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

// Web counterpart to /api/mobile/lessons, which is Bearer-only. The browser
// authenticates by cookie, so it needs its own entry point.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("lessons")
    .select('id, title, summary, body, image_url, video_url, duration_minutes, "order"')
    .order("order", { ascending: true });

  if (error) {
    // The table may not exist yet; say so rather than failing the page.
    return NextResponse.json({ lessons: [], error: error.message });
  }

  return NextResponse.json({ lessons: data ?? [] });
}
