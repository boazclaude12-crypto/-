import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { getBearerToken, createClientFromToken } from "@lib/supabase/bearer";
import OpenAI from "openai";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: Request) {
  try {
    // Support cookie-based auth (web) and Bearer token (mobile)
    const bearerToken = getBearerToken(request);
    const supabase = bearerToken
      ? createClientFromToken(bearerToken)
      : await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "unauthorized", message: "Unauthorized" }, { status: 401 });

    // Fetch user profile and plan (free tier fallback when no plan_id)
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("plan_id")
      .eq("user_id", user.id)
      .single();

    let dailyLimit = 3; // free tier default
    if (profile?.plan_id) {
      const { data: plan } = await supabase
        .from("plans")
        .select("daily_limit")
        .eq("id", profile.plan_id)
        .single();
      if (plan) dailyLimit = plan.daily_limit;
    }

    // Check daily request limit (Israel timezone)
    const now = new Date();
    const israelTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
    israelTime.setHours(0, 0, 0, 0);

    const { data: recentRequests } = await supabase
      .from("user_requests")
      .select("id")
      .eq("user_id", user.id)
      .gte("created_at", israelTime.toISOString());

    if (recentRequests && recentRequests.length >= dailyLimit) {
      return NextResponse.json(
        { error: "limit_reached", message: "Daily limit reached, try again tomorrow" },
        { status: 429 }
      );
    }

    // Parse body: JSON (mobile sends imageBase64) or multipart (web sends file)
    const contentType = request.headers.get("content-type") ?? "";
    let assetName = "chart";
    let assetNameType = "crypto";
    let imageBuffer: Buffer;

    if (contentType.includes("application/json")) {
      const body = await request.json();
      assetName = body.assetName || "chart";
      assetNameType = body.assetNameType || "crypto";
      if (!body.imageBase64)
        return NextResponse.json({ error: "missing_image", message: "imageBase64 is required" }, { status: 400 });
      const base64Raw = (body.imageBase64 as string).replace(/^data:image\/\w+;base64,/, "");
      imageBuffer = Buffer.from(base64Raw, "base64");
    } else {
      const form = await request.formData();
      assetName = (form.get("assetName") as string) || "chart";
      assetNameType = (form.get("assetNameType") as string) || "crypto";
      const file = form.get("image") as File | null;
      if (!file)
        return NextResponse.json({ error: "missing_image", message: "Image file is required" }, { status: 400 });
      imageBuffer = Buffer.from(await file.arrayBuffer());
    }

    // The client already surfaces this exact message, but nothing enforced the
    // limit, so an oversized upload went straight to the vision model — billed
    // per image — and to storage. Reject it here instead.
    const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
    if (imageBuffer.byteLength > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "Image size must be less than 5MB", message: "Image size must be less than 5MB" },
        { status: 400 }
      );
    }
    if (imageBuffer.byteLength === 0) {
      return NextResponse.json({ error: "missing_image", message: "Image is empty" }, { status: 400 });
    }

    const assetNameSliced = assetName.length > 10 ? assetName.slice(0, 10) : assetName;

    // Upload image to Supabase Storage
    const fileName = `${uuidv4()}.png`;
    const imagePath = `${user.id}/${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from("images")
      .upload(imagePath, imageBuffer, { contentType: "image/png" });
    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage.from("images").getPublicUrl(imagePath);
    const imageUrl = publicUrlData.publicUrl;

    // A single vision completion, rather than the Assistants flow this used to
    // run. That flow needed an assistant created in one specific OpenAI account,
    // so a key from any other account failed with a 404 that looked like a
    // generic analysis error. Keeping the instructions in the repo removes that
    // coupling, and replaces seven round trips (thread, file, message, run,
    // polling, read, delete) with one.
    const openai = new OpenAI({
      apiKey: process.env.NET_PUBLIC_SITE_URL_OPENAI_API_KEY,
      timeout: 60_000,
      maxRetries: 1,
    });

    // OpenAI accepts png, jpeg, gif and webp; label the bytes we actually got.
    const sniffMime = (b: Buffer): string => {
      if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
      if (b[0] === 0x47 && b[1] === 0x49) return "image/gif";
      if (b.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
      return "image/png";
    };
    const dataUrl = `data:${sniffMime(imageBuffer)};base64,${imageBuffer.toString("base64")}`;

    const SYSTEM_PROMPT = `אתה אנליסט טכני מנוסה שמנתח גרפי מסחר עבור סוחרים ישראלים.

עליך לענות **תמיד בעברית**, בגוף פונה לסוחר, בטון מקצועי ובהיר.

נתח את הגרף שקיבלת והחזר תשובה מובנית בסעיפים הבאים:

**סקירה כללית** — הנכס, מסגרת הזמן והמגמה הנוכחית (עולה / יורדת / דשדוש).

**רמות מפתח** — רמות תמיכה והתנגדות מרכזיות, עם מספרים מהגרף.

**תבניות ואינדיקטורים** — תבניות נרות או מחיר שזיהית, ומה שניתן להסיק מנפח המסחר ומאינדיקטורים שנראים בגרף.

**תרחיש מסחר** — נקודת כניסה מוצעת, סטופ לוס, טייק פרופיט, ויחס סיכון/סיכוי משוער.

**סיכונים** — מה יפריך את התרחיש ומה כדאי לעקוב אחריו.

כללים:
- הסתמך רק על מה שנראה בגרף. אם נתון לא קריא, אמור זאת במפורש ואל תמציא מספרים.
- אם התמונה אינה גרף מסחר, אמור זאת בקצרה ואל תנתח.
- סיים במשפט: "אין באמור המלצה להשקעה. המסחר כרוך בסיכון."`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_ANALYSIS_MODEL || "gpt-4o",
      max_tokens: 1500,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: `נתח בבקשה את הגרף הזה של ${assetNameSliced}.` },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          ],
        },
      ],
    });

    const analysisText = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!analysisText) throw new Error("OpenAI returned an empty analysis");

    // Save request counter
    await supabase.from("user_requests").insert([{ user_id: user.id }]);

    // Insert and return the full analysis row
    const { data: inserted, error: insertErr } = await supabase
      .from("analyses")
      .insert([{
        user_id: user.id,
        asset_name: assetNameSliced,
        analysis: analysisText,
        image: imageUrl,
        type: assetNameType,
      }])
      .select()
      .single();

    if (insertErr) throw insertErr;

    return NextResponse.json({
      id: inserted.id,
      created_at: inserted.created_at,
      image_url: inserted.image,
      symbol: inserted.asset_name,
      type: inserted.type,
      explanation: inserted.analysis,
    });
  } catch (error: any) {
    console.error("Error in analysis API:", error);
    return NextResponse.json({ error: "internal_error", message: error.message || "Internal error" }, { status: 500 });
  }
}
