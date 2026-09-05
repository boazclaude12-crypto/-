import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { getBearerToken, createClientFromToken } from "@lib/supabase/bearer";
import { v4 as uuidv4 } from "uuid";
import { getEntitlement, getUsedToday } from "../../../../lib/subscription";
import { renderAnalysis } from "../../../../lib/analysisReport";
import { analyzeChart } from "../../../../lib/analysisProvider";

// A thorough analysis can outrun the platform default, and being cut off
// mid-request wastes the model call entirely.
export const maxDuration = 120;

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

    // Entitlement, not just plan_id: a lapsed subscription must not keep the
    // limits it stopped paying for.
    const entitlement = await getEntitlement(supabase, user.id);
    const usedToday = await getUsedToday(supabase, user.id);

    if (usedToday >= entitlement.dailyLimit) {
      return NextResponse.json(
        {
          error: "limit_reached",
          message: entitlement.expired
            ? "המנוי שלך הסתיים. חדש אותו כדי להמשיך לנתח גרפים."
            : "Daily limit reached, try again tomorrow",
          expired: entitlement.expired,
        },
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

    // OpenAI and Anthropic both accept png, jpeg, gif and webp; label the bytes
    // we actually got rather than always claiming PNG.
    const sniffMime = (b: Buffer): string => {
      if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
      if (b[0] === 0x47 && b[1] === 0x49) return "image/gif";
      if (b.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
      return "image/png";
    };

    // Upload image to Supabase Storage
    const fileName = `${uuidv4()}.png`;
    const imagePath = `${user.id}/${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from("images")
      .upload(imagePath, imageBuffer, { contentType: "image/png" });
    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage.from("images").getPublicUrl(imagePath);
    const imageUrl = publicUrlData.publicUrl;

    const structured = await analyzeChart(imageBuffer, sniffMime(imageBuffer), assetNameSliced);
    const analysisText = renderAnalysis(structured);

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

