import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { getBearerToken, createClientFromToken } from "@lib/supabase/bearer";
import OpenAI, { toFile } from "openai";
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

    // OpenAI Assistants API
    const openai = new OpenAI({ apiKey: process.env.NET_PUBLIC_SITE_URL_OPENAI_API_KEY });
    const assistantId = process.env.NEXT_PUBLIC_SITE_OPENAI_ASSISTANT_ID || "";

    const thread = await openai.beta.threads.create();
    const uploadedFile = await openai.files.create({
      file: await toFile(imageBuffer, fileName),
      purpose: "vision",
    });
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: [
        { type: "image_file", image_file: { file_id: uploadedFile.id } },
        { type: "text", text: "תנתחי לי את הגרף של " + assetNameSliced },
      ],
    });
    const run = await openai.beta.threads.runs.create(thread.id, { assistant_id: assistantId });

    const POLL_TIMEOUT_MS = 60_000;
    const pollStart = Date.now();
    let done = false;
    while (!done) {
      if (Date.now() - pollStart > POLL_TIMEOUT_MS) {
        await openai.beta.threads.runs.cancel(thread.id, run.id).catch(() => {});
        throw new Error("OpenAI analysis timed out");
      }
      const runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      if (runStatus.status === "completed") done = true;
      else if (["failed", "cancelled", "expired"].includes(runStatus.status)) {
        throw new Error(`OpenAI run ${runStatus.status}`);
      } else await new Promise(r => setTimeout(r, 500));
    }

    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantMsg = messages.data.find(m => m.role === "assistant");
    let analysisText = "";
    if (assistantMsg?.content[0].type === "text") {
      analysisText = assistantMsg.content[0].text.value;
    }
    await openai.files.del(uploadedFile.id);

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
