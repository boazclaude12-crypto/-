import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { StructuredAnalysis } from "./analysisReport";

/**
 * Chart analysis, behind one function so the model provider is a deployment
 * choice rather than something wired through the route.
 *
 * Selection: ANALYSIS_PROVIDER if set, otherwise Anthropic when its key is
 * present, otherwise OpenAI. Adding ANTHROPIC_API_KEY is therefore enough to
 * switch, and removing it falls back rather than breaking.
 */
export type Provider = "anthropic" | "openai";

export function selectedProvider(): Provider {
  const explicit = process.env.ANALYSIS_PROVIDER?.toLowerCase();
  if (explicit === "anthropic" || explicit === "openai") return explicit;
  return process.env.ANTHROPIC_API_KEY ? "anthropic" : "openai";
}

export function selectedModel(provider: Provider = selectedProvider()): string {
  return provider === "anthropic"
    ? process.env.ANTHROPIC_ANALYSIS_MODEL || "claude-opus-5"
    : process.env.OPENAI_ANALYSIS_MODEL || "gpt-4o";
}

export const SYSTEM_PROMPT = `אתה אנליסט טכני בכיר המנתח צילום מסך של גרף מסחר עבור סוחרים ישראלים.
יש לך אך ורק את התמונה. אין לך נתוני שוק חיים, אין היסטוריה, ואין ידע קודם שמותר להשתמש בו.
המטרה אינה לנחש כיוון אלא לאפשר רווחיות עקבית — ולכן "אין עסקה" היא תשובה מקצועית ונכונה ברוב המקרים.

# שלב 1 — קריאת הצירים (לפני כל מספר)
קרא לפחות שתי תוויות מספריות בציר המחיר האנכי וגזור מהן את קנה המידה.
אם קראת פחות משתיים — 'price_axis.readable: false', 'levels' ריק, 'direction: "none"', והסבר ב-'unreadable'.
קבע 'price_axis.precision' = צעד עיגול שאינו קטן מעשירית המרווח בין קווי גריד סמוכים.
כל מספר שתחזיר חייב להיות כפולה של הצעד הזה. אל תחזיר ספרות שהתמונה לא מאפשרת לקרוא.
קרא את המחיר האחרון ל-'last_price'. בלי מחיר אחרון קריא — אין תרחיש, 'direction: "none"'.

# שלב 2 — מבנה השוק
שיא נדנוד = נר שהגבוה שלו גבוה משני הנרות מכל צד. שפל נדנוד = הנמוך שלו נמוך משני הנרות מכל צד.
מלא את 'structure.swing_points' בסדר כרונולוגי. 'trend' נגזר מהרשימה הזו בלבד — אם הם סותרים, תקן את המגמה ולא את הרשימה.
פחות מארבע נקודות מתחלפות — 'trend: "לא ברור"' ו-'confidence: "נמוכה"'.

- **עולה** = שני השיאים האחרונים עולים **וגם** שני השפלים האחרונים עולים.
- **יורדת** = שני השיאים יורדים **וגם** שני השפלים יורדים.
- כל שילוב אחר — 'דשדוש' או 'לא ברור'. שיאים עולים בלי שפלים עולים אינם מגמה.
- **שיפוע ויזואלי אינו מגמה.** אסור לגזור מגמה מזווית הגרף, מצבע נרות, מנר בודד או משיפוע ממוצע נע.
- **דשדוש** = תנועה בין רצפה לתקרה שנבדקו פעמיים לפחות, כשהנדנודים חופפים.

**שבירת מבנה נספרת רק בסגירת נר מעבר לרמה.** פתיל שחדר וחזר הוא איסוף נזילות — 'last_break.confirmed_by_close: false'.
במגמה עולה כל ירידה היא תיקון עד סגירה מתחת לשפל המאושר האחרון; אז זה שינוי אופי, לא היפוך.
**שינוי אופי אחד אינו היפוך** — 'phase: "מעבר"', 'trend: "לא ברור"', והורדת 'confidence' בדרגה.
המילים "היפוך" או "סוף מגמה" מותרות רק אחרי סגירה מעבר לנקודת המבנה **וגם** יצירת נקודת מבנה חדשה בכיוון החדש.

**קצה ימין של התמונה אינו מאושר** — נדרשים שני נרות אחרי כל נקודת מבנה. אל תבסס עליה מגמה או שבירה.
פחות מ-30 נרות, נרות צפופים מכדי להבחין בפתילים, או גרף קו — אין די מידע: 'trend: "לא ברור"', 'confidence: "נמוכה"'.

# שלב 3 — רמות
**מגע** = נר שהגיע לרמה ונדחה ממנה לפחות שליש מגובה התנועה שהובילה אליה. חדירה שנמשכה אינה מגע.
שני מגעים נפרדים רק אם מפרידים ביניהם 5 נרות לפחות.

רמה נכנסת ל-'levels' רק אם: (א) שני מגעים נפרדים לפחות, או (ב) היא הקצה המוחלט של התמונה — ואז 'strength: "חלשה"'.
מועמדת עם מגע יחיד שאינה קצה — אל תחזיר כלל.

**רמה היא אזור ולא קו.** תמיד 'low'–'high', לעולם לא מספר בודד. רוחב מינימלי = מרווח גריד חלקי 4.
דחיות בפתילים → קבע לפי קצות הפתילים ו-'touch_type: "פתילים"'. בסגירות → 'גופים'. מעורב → מתח מקצה לקצה.

**עקביות צד המחיר מוחלטת:** רמה מתחת ל-'last_price' היא תמיכה, מעליו התנגדות. אין חריגים.
אסור להחזיר רמה מחוץ לטווח הנראה בציר.

# שלב 4 — התרחיש, בסדר הזה בלבד
1. 'last_price' 2. 'stop_loss' 3. 'entry' 4. סיכון ליחידה 5. 'take_profit' 6. סיכוי ליחידה 7. 'risk_reward'

**הסטופ נקבע לפני היעד**, מעבר לקצה הרחוק של אזור הרמה המבנית שהפרכתה שוברת את התרחיש, בתוספת מרווח.
לא בתוך האזור, לא בדיוק על גבולו, לא על מספר עגול, ולא במרחק שרירותי או באחוז קבוע.
סטופ קרוב מ-0.3% מהמחיר, או קטן מגובה 2–3 הנרות האחרונים, הוא בתוך הרעש — אסור.

**היעד הוא הרמה הנגדית הקרובה ביותר** מבין הרמות שהחזרת. אסור לדלג מעל רמה קרובה כדי לשפר את היחס.
'stop_level_id' ו-'target_level_id' חייבים להצביע על רמות קיימות ב-'levels'. אין רמה כשירה ליעד — 'direction: "none"'.

**חישוב היחס שמרני:** הסיכון מהכניסה עד הקצה הרחוק של אזור הסטופ, הסיכוי מהכניסה עד הקצה הקרוב של אזור היעד.
**יחס מתחת ל-1:2 — 'direction: "none"'.** אסור לקרב את הסטופ או למתוח את היעד כדי לתקן. ציין את היחס שהתקבל בפועל.

אכוף את הסדר הגיאומטרי: בלונג 'stop_loss < entry < take_profit'; בשורט 'take_profit < entry < stop_loss'.
לא מתקיים — 'direction: "none"', בלי לתקן מספרים בכוח.

# מתי חובה להחזיר direction: "none"
- הציר או המחיר האחרון אינם קריאים
- פחות מארבע נקודות מבנה, או מבנה לא חד-משמעי
- המחיר באמצע טווח או באמצע גל — אין סטופ מבני קצר
- אין רמה כשירה לשמש יעד
- היחס יוצא נמוך מ-1:2
- עסקה נגד המגמה בלי שינוי אופי מאושר בסגירה

במקרה כזה: 'entry', 'stop_loss', 'take_profit', 'risk_reward' כולם 'null', מלא 'no_trade_reason',
ו-'rationale' יסביר איזה תנאי חסר — בלי להזכיר שום מחיר כניסה או יעד.
עסקה נגד המגמה מותרת רק עם 'counter_structure: true' ונימוק מפורש.

# איסורים מוחלטים
- **אין ידע קודם.** לא מחירים שאתה זוכר, לא רמות מפורסמות, לא אירועי מאקרו. התמונה קובעת תמיד.
- **אל תזהה אינדיקטור שאינו מצויר בתמונה.** אם RSI או ממוצע נע אינם מוצגים — אל תתייחס אליהם.
- **אל תטען דבר על מסגרת זמן שאינה מוצגת.**
- **לעולם אל תציין סכום כסף, מספר יחידות, מניות, לוטים, חוזים או מינוף** — אינך יודע את גודל התיק.
  במקום זאת מלא 'position_sizing_note' בנוסחה ובאחוז מרחק הסטופ.

# ביטחון
'confidence: "גבוהה"' אסור אם: הציר אינו קריא, יש פריט ב-'unreadable' הנוגע לציר או לרמה,
או שאין אף רמה עם שלושה מגעים ומעלה.
'summary', 'rationale' ו-'invalidation' חייבים להיות עקביים עם 'trend' ועם 'phase'.
אסור ש-'summary' יתאר היפוך כאשר 'phase' הוא תיקון, או מגמה כאשר 'trend' הוא דשדוש.

אם התמונה אינה גרף מסחר — 'is_chart: false' ומלא רק את 'summary'.
כל הטקסט בעברית בלבד.`;

const LEVEL_ITEM = {
  type: "object",
  additionalProperties: false,
  required: ["id", "kind", "low", "high", "touches", "touch_type", "strength"],
  properties: {
    id: { type: "string", description: "מזהה קצר וייחודי, למשל L1" },
    kind: { type: "string", enum: ["תמיכה", "התנגדות"] },
    low: { type: "number" },
    high: { type: "number" },
    touches: { type: "integer" },
    touch_type: { type: "string", enum: ["פתילים", "גופים", "מעורב"] },
    strength: { type: "string", enum: ["חזקה", "בינונית", "חלשה"] },
  },
} as const;

/** Shared by both providers: OpenAI takes it as json_schema, Anthropic as a strict tool. */
export const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "is_chart", "asset", "timeframe", "price_axis", "last_price", "structure",
    "levels", "indicators", "volume_note", "scenario", "position_sizing_note",
    "invalidation", "confidence", "unreadable", "summary",
  ],
  properties: {
    is_chart: { type: "boolean" },
    asset: { type: "string" },
    timeframe: { type: "string" },
    price_axis: {
      type: "object",
      additionalProperties: false,
      required: ["readable", "low", "high", "precision"],
      properties: {
        readable: { type: "boolean", description: "האם נקראו לפחות שתי תוויות מחיר" },
        low: { type: ["number", "null"] },
        high: { type: ["number", "null"] },
        precision: { type: ["number", "null"], description: "צעד העיגול שנגזר מהגריד" },
      },
    },
    last_price: { type: ["number", "null"] },
    structure: {
      type: "object",
      additionalProperties: false,
      required: ["swing_points", "trend", "strength", "phase", "location", "last_break"],
      properties: {
        swing_points: {
          type: "array",
          description: "נקודות המבנה בסדר כרונולוגי משמאל לימין",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["kind", "price"],
            properties: {
              kind: { type: "string", enum: ["שיא", "שפל"] },
              price: { type: "number" },
            },
          },
        },
        trend: { type: "string", enum: ["עולה", "יורדת", "דשדוש", "לא ברור"] },
        strength: { type: "string", enum: ["חזקה", "בינונית", "חלשה", "לא ברור"] },
        phase: { type: "string", enum: ["מגמה", "תיקון במגמה", "מעבר", "דשדוש", "לא ברור"] },
        location: { type: "string", enum: ["קצה עליון", "קצה תחתון", "אמצע", "לא ברור"] },
        last_break: {
          type: "object",
          additionalProperties: false,
          required: ["happened", "confirmed_by_close", "note"],
          properties: {
            happened: { type: "boolean" },
            confirmed_by_close: { type: "boolean" },
            note: { type: "string" },
          },
        },
      },
    },
    levels: { type: "array", items: LEVEL_ITEM },
    indicators: { type: "array", items: { type: "string" }, description: "רק אינדיקטורים המצוירים בתמונה" },
    volume_note: { type: "string" },
    scenario: {
      type: "object",
      additionalProperties: false,
      required: [
        "direction", "entry", "stop_loss", "take_profit", "risk_reward",
        "stop_level_id", "target_level_id", "stop_distance_pct",
        "counter_structure", "no_trade_reason", "rationale",
      ],
      properties: {
        direction: { type: "string", enum: ["long", "short", "none"] },
        entry: { type: ["number", "null"] },
        stop_loss: { type: ["number", "null"] },
        take_profit: { type: ["number", "null"] },
        risk_reward: { type: ["number", "null"] },
        stop_level_id: { type: ["string", "null"] },
        target_level_id: { type: ["string", "null"] },
        stop_distance_pct: { type: ["number", "null"] },
        counter_structure: { type: "boolean" },
        no_trade_reason: { type: ["string", "null"] },
        rationale: { type: "string" },
      },
    },
    position_sizing_note: { type: "string" },
    invalidation: { type: "string" },
    confidence: { type: "string", enum: ["גבוהה", "בינונית", "נמוכה"] },
    unreadable: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
  },
} as const;

const userPrompt = (assetName: string) =>
  `נתח את הגרף הזה. הנכס לפי המשתמש: ${assetName}. אם הגרף עצמו מציין נכס אחר — סמוך על הגרף.`;

async function analyzeWithAnthropic(
  imageBuffer: Buffer,
  mime: string,
  assetName: string
): Promise<StructuredAnalysis> {
  const client = new Anthropic({ timeout: 120_000, maxRetries: 1 });

  // A strict tool is how this model family returns schema-valid JSON without
  // pulling in a schema library. Sampling parameters are rejected on Opus 5 and
  // Sonnet 5, so none are sent; depth is controlled by effort instead.
  const message = await client.messages.create({
    model: selectedModel("anthropic"),
    max_tokens: 8000,
    // The tools and system prompt are byte-identical on every analysis and only
    // the image varies, so the whole prefix up to here is cacheable. Caching is
    // a prefix match and tools render before system, so one breakpoint at the
    // end of the system block covers both.
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    output_config: { effort: "high" },
    tools: [
      {
        name: "submit_analysis",
        description: "החזרת ניתוח הגרף במבנה מוגדר",
        input_schema: ANALYSIS_SCHEMA as any,
        strict: true,
      } as any,
    ],
    tool_choice: { type: "tool", name: "submit_analysis" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mime as any, data: imageBuffer.toString("base64") },
          },
          { type: "text", text: userPrompt(assetName) },
        ],
      },
    ],
  });

  const block = message.content.find(b => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("Claude returned no analysis");
  }
  return block.input as unknown as StructuredAnalysis;
}

async function analyzeWithOpenAI(
  imageBuffer: Buffer,
  mime: string,
  assetName: string
): Promise<StructuredAnalysis> {
  const client = new OpenAI({
    apiKey: process.env.NET_PUBLIC_SITE_URL_OPENAI_API_KEY,
    timeout: 120_000,
    maxRetries: 1,
  });

  const completion = await client.chat.completions.create({
    model: selectedModel("openai"),
    max_tokens: 2000,
    temperature: 0.2,
    response_format: {
      type: "json_schema",
      json_schema: { name: "chart_analysis", strict: true, schema: ANALYSIS_SCHEMA as any },
    },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt(assetName) },
          {
            type: "image_url",
            image_url: {
              url: `data:${mime};base64,${imageBuffer.toString("base64")}`,
              detail: "high",
            },
          },
        ],
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("OpenAI returned an empty analysis");
  try {
    return JSON.parse(raw) as StructuredAnalysis;
  } catch {
    throw new Error("OpenAI returned malformed analysis");
  }
}

export async function analyzeChart(
  imageBuffer: Buffer,
  mime: string,
  assetName: string
): Promise<StructuredAnalysis> {
  return selectedProvider() === "anthropic"
    ? analyzeWithAnthropic(imageBuffer, mime, assetName)
    : analyzeWithOpenAI(imageBuffer, mime, assetName);
}
