import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { getBearerToken, createClientFromToken } from "@lib/supabase/bearer";
import OpenAI from "openai";
import { v4 as uuidv4 } from "uuid";
import { getEntitlement, getUsedToday } from "../../../../lib/subscription";
import { renderAnalysis } from "../../../../lib/analysisReport";

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

    const SYSTEM_PROMPT = `אתה אנליסט טכני בכיר. אתה מנתח גרפי מסחר — מניות, קריפטו, מדדים, פורקס וסחורות — עבור סוחרים ישראלים.

## שיטת העבודה

עבוד בסדר הזה, ואל תדלג על שלב:

1. **קרא את הצירים.** זהה את טווח המחירים בציר האנכי ואת טווח הזמן בציר האופקי. כל מספר שתיתן חייב להיגזר מהם.
2. **זהה את הנכס ומסגרת הזמן** מהכותרת או מהתוויות שבגרף.
3. **מפה את המבנה** — רצף השיאים והשפלים. מגמה עולה מוגדרת כשיאים ושפלים עולים; יורדת כשיאים ושפלים יורדים; דשדוש כשאין רצף כזה.
4. **אתר רמות** שהמחיר נגע בהן ונדחה מהן יותר מפעם אחת. רמה שנגעו בה פעם אחת אינה רמה.
5. **בדוק נפח** — האם תנועות משמעותיות לוו בנפח חריג.
6. **בנה תרחיש** רק אם המבנה תומך בו.

## כללי דיוק — קריטיים

- **אל תמציא מספרים.** כל מחיר שתציין חייב להיות קריא מהגרף. אם ציר המחירים מטושטש או חתוך — אמור זאת ברשימת \`unreadable\` והשאר את השדות המספריים ריקים.
- **אל תמציא דיוק.** אם הרזולוציה מאפשרת לקרוא רק ברמת אלפים — עגל בהתאם. עדיף "בערך 76,000" מאשר "76,342".
- **אל תזהה אינדיקטור שאינו מוצג.** אם RSI או ממוצעים נעים אינם על הגרף — אל תתייחס אליהם.
- **הסטופ חייב להיות במקום שמפריך את התרחיש** — מעבר לרמה מבנית — ולא במרחק שרירותי.
- **אם המבנה לא תומך בעסקה, אמור זאת.** \`direction: "none"\` הוא תשובה לגיטימית ומקצועית. עדיף להימנע מעסקה מאשר להמציא אחת.
- **דרג את הביטחון שלך בכנות.** גרף חתוך, מטושטש או חסר הקשר מקבל ביטחון נמוך.

## אם התמונה אינה גרף מסחר
החזר \`is_chart: false\` ומלא רק את \`summary\` בהסבר קצר.

כל הטקסט שתחזיר — בעברית בלבד.`;

    // Structured output rather than free prose: it forces the model through the
    // fields we actually need, makes "no trade" and "unreadable" first-class
    // answers instead of things it might silently skip, and yields numbers the
    // trade journal can consume. The Hebrew report is rendered from it below.
    const SCHEMA = {
      type: "object",
      additionalProperties: false,
      required: [
        "is_chart", "asset", "timeframe", "trend", "trend_strength",
        "support_levels", "resistance_levels", "patterns", "indicators",
        "volume_note", "scenario", "invalidation", "confidence", "unreadable", "summary",
      ],
      properties: {
        is_chart: { type: "boolean" },
        asset: { type: "string" },
        timeframe: { type: "string" },
        trend: { type: "string", enum: ["עולה", "יורדת", "דשדוש", "לא ברור"] },
        trend_strength: { type: "string", enum: ["חזקה", "בינונית", "חלשה", "לא ברור"] },
        support_levels: { type: "array", items: { type: "number" } },
        resistance_levels: { type: "array", items: { type: "number" } },
        patterns: { type: "array", items: { type: "string" } },
        indicators: { type: "array", items: { type: "string" } },
        volume_note: { type: "string" },
        scenario: {
          type: "object",
          additionalProperties: false,
          required: ["direction", "entry", "stop_loss", "take_profit", "risk_reward", "rationale"],
          properties: {
            direction: { type: "string", enum: ["long", "short", "none"] },
            entry: { type: ["number", "null"] },
            stop_loss: { type: ["number", "null"] },
            take_profit: { type: ["number", "null"] },
            risk_reward: { type: ["number", "null"] },
            rationale: { type: "string" },
          },
        },
        invalidation: { type: "string" },
        confidence: { type: "string", enum: ["גבוהה", "בינונית", "נמוכה"] },
        unreadable: { type: "array", items: { type: "string" } },
        summary: { type: "string" },
      },
    } as const;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_ANALYSIS_MODEL || "gpt-4o",
      max_tokens: 2000,
      temperature: 0.2, // analysis should be reproducible, not creative
      response_format: {
        type: "json_schema",
        json_schema: { name: "chart_analysis", strict: true, schema: SCHEMA as any },
      },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `נתח את הגרף הזה. הנכס לפי המשתמש: ${assetNameSliced}. ` +
                    `אם הגרף עצמו מציין נכס אחר — סמוך על הגרף.`,
            },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          ],
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!raw) throw new Error("OpenAI returned an empty analysis");

    let structured: any;
    try {
      structured = JSON.parse(raw);
    } catch {
      throw new Error("OpenAI returned malformed analysis");
    }

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

