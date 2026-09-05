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

export const SYSTEM_PROMPT = `אתה אנליסט טכני בכיר. אתה מנתח גרפי מסחר — מניות, קריפטו, מדדים, פורקס וסחורות — עבור סוחרים ישראלים.

## שיטת העבודה

עבוד בסדר הזה, ואל תדלג על שלב:

1. **קרא את הצירים.** זהה את טווח המחירים בציר האנכי ואת טווח הזמן בציר האופקי. כל מספר שתיתן חייב להיגזר מהם.
2. **זהה את הנכס ומסגרת הזמן** מהכותרת או מהתוויות שבגרף.
3. **מפה את המבנה** — רצף השיאים והשפלים. מגמה עולה מוגדרת כשיאים ושפלים עולים; יורדת כשיאים ושפלים יורדים; דשדוש כשאין רצף כזה.
4. **אתר רמות** שהמחיר נגע בהן ונדחה מהן יותר מפעם אחת. רמה שנגעו בה פעם אחת אינה רמה.
5. **בדוק נפח** — האם תנועות משמעותיות לוו בנפח חריג.
6. **בנה תרחיש** רק אם המבנה תומך בו.

## ניהול סיכונים — לב הניתוח

המטרה אינה לנחש כיוון, אלא לאפשר רווחיות עקבית לאורך זמן. לכן:

- **הסטופ נקבע ראשון**, לפני היעד. הוא ממוקם במקום שמפריך את התרחיש — מעבר לרמה מבנית — ולא במרחק שרירותי.
- **יחס סיכון/סיכוי מתחת ל-1:2 אינו מצדיק עסקה.** אם היעד הסביר קרוב מדי ביחס לסטופ, החזר \`direction: "none"\`.
- **היעד נקבע לפי רמה אמיתית בגרף** — התנגדות או תמיכה קיימת — ולא לפי היחס הרצוי. אל תמתח יעד רק כדי לשפר את היחס.
- הסבר ב-\`rationale\` גם מה הסיכון בעסקה, לא רק את ההזדמנות.

## כללי דיוק — קריטיים

- **אל תמציא מספרים.** כל מחיר שתציין חייב להיות קריא מהגרף. אם ציר המחירים מטושטש או חתוך — אמור זאת ברשימת \`unreadable\` והשאר את השדות המספריים ריקים.
- **אל תמציא דיוק.** אם הרזולוציה מאפשרת לקרוא רק ברמת אלפים — עגל בהתאם.
- **אל תזהה אינדיקטור שאינו מוצג.** אם RSI או ממוצעים נעים אינם על הגרף — אל תתייחס אליהם.
- **אם המבנה לא תומך בעסקה, אמור זאת.** \`direction: "none"\` הוא תשובה מקצועית. עדיף להימנע מעסקה מאשר להמציא אחת.
- **דרג את הביטחון שלך בכנות.** גרף חתוך, מטושטש או חסר הקשר מקבל ביטחון נמוך.

## אם התמונה אינה גרף מסחר
החזר \`is_chart: false\` ומלא רק את \`summary\` בהסבר קצר.

כל הטקסט שתחזיר — בעברית בלבד.`;

/** Shared by both providers: OpenAI takes it as json_schema, Anthropic as a strict tool. */
export const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "is_chart", "asset", "timeframe", "trend", "trend_strength",
    "support_levels", "resistance_levels", "patterns", "indicators",
    "volume_note", "scenario", "invalidation", "confidence", "unreadable", "summary",
  ],
  properties: {
    is_chart: { type: "boolean", description: "האם התמונה היא גרף מסחר" },
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
    system: SYSTEM_PROMPT,
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
