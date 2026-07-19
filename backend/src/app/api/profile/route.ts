// src/app/api/profile/route.ts
import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { avatarBase64 } = body;
    if (!avatarBase64) return NextResponse.json({ error: "No avatar provided" }, { status: 400 });

    // העלאת תמונת הפרופיל ל־Storage
    const fileName = `${user.id}-avatar.png`;
    const { error: storageError } = await supabase
      .storage
      .from("avatars")
      .upload(fileName, Buffer.from(avatarBase64, "base64"), { upsert: true });
    if (storageError) {
      return NextResponse.json({ error: "Avatar upload failed" }, { status: 500 });
    }
    const avatarUrl = supabase.storage.from("avatars").getPublicUrl(fileName).data.publicUrl;

    // עדכון טבלת user_profiles
    const { error } = await supabase
      .from("user_profiles")
      .update({ avatar_url: avatarUrl })
      .eq("user_id", user.id);
    if (error) return NextResponse.json({ error: "Profile update failed" }, { status: 500 });

    return NextResponse.json({ avatarUrl });
  } catch (error: any) {
    console.error("Error updating profile:", error);
    return NextResponse.json({ error: error.message || "Internal error" }, { status: 500 });
  }
}
