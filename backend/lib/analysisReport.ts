/**
 * Turns the structured analysis the model returns into the Hebrew report the
 * user reads. Kept out of the route so it can be tested directly.
 */
export interface AnalysisScenario {
  direction: "long" | "short" | "none";
  entry: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  risk_reward: number | null;
  rationale: string;
}

export interface StructuredAnalysis {
  is_chart: boolean;
  asset: string;
  timeframe: string;
  trend: string;
  trend_strength: string;
  support_levels: number[];
  resistance_levels: number[];
  patterns: string[];
  indicators: string[];
  volume_note: string;
  scenario: AnalysisScenario;
  invalidation: string;
  confidence: string;
  unreadable: string[];
  summary: string;
}
const DIRECTION_HE: Record<string, string> = { long: "לונג (קנייה)", short: "שורט (מכירה)", none: "אין עסקה" };

const fmt = (n: number) => n.toLocaleString("he-IL", { maximumFractionDigits: 8 });

/** Renders the structured analysis into the Hebrew report shown to the user. */
export function renderAnalysis(a: any): string {
  if (a?.is_chart === false) {
    return `**לא זוהה גרף מסחר בתמונה**\n\n${a.summary ?? "נסה להעלות צילום מסך של גרף מסחר."}`;
  }

  const L: string[] = [];
  const confidenceMark = { גבוהה: "🟢", בינונית: "🟡", נמוכה: "🔴" }[a.confidence as string] ?? "";

  L.push(`## ${a.asset || "ניתוח גרף"}${a.timeframe ? ` · ${a.timeframe}` : ""}`);
  if (a.summary) L.push(a.summary);

  L.push(`\n**מגמה:** ${a.trend}${a.trend_strength && a.trend_strength !== "לא ברור" ? ` (עוצמה ${a.trend_strength})` : ""}`);
  L.push(`**רמת ביטחון בניתוח:** ${confidenceMark} ${a.confidence}`);

  if (a.support_levels?.length || a.resistance_levels?.length) {
    L.push(`\n### רמות מפתח`);
    if (a.support_levels?.length) L.push(`- **תמיכה:** ${a.support_levels.map(fmt).join(" · ")}`);
    if (a.resistance_levels?.length) L.push(`- **התנגדות:** ${a.resistance_levels.map(fmt).join(" · ")}`);
  }

  if (a.patterns?.length || a.indicators?.length || a.volume_note) {
    L.push(`\n### תבניות ואינדיקטורים`);
    for (const p of a.patterns ?? []) L.push(`- ${p}`);
    for (const i of a.indicators ?? []) L.push(`- ${i}`);
    if (a.volume_note) L.push(`- **נפח:** ${a.volume_note}`);
  }

  const s = a.scenario ?? {};
  L.push(`\n### תרחיש מסחר`);
  if (s.direction === "none") {
    L.push(`**המבנה הנוכחי אינו תומך בכניסה לעסקה.**`);
    if (s.rationale) L.push(s.rationale);
  } else {
    L.push(`**כיוון:** ${DIRECTION_HE[s.direction] ?? s.direction}`);
    const rows: string[] = [];
    if (s.entry != null) rows.push(`| כניסה | ${fmt(s.entry)} |`);
    if (s.stop_loss != null) rows.push(`| סטופ לוס | ${fmt(s.stop_loss)} |`);
    if (s.take_profit != null) rows.push(`| טייק פרופיט | ${fmt(s.take_profit)} |`);
    if (s.risk_reward != null) rows.push(`| יחס סיכון/סיכוי | 1:${s.risk_reward} |`);
    if (rows.length) L.push(`\n| | |\n|---|---|\n${rows.join("\n")}`);
    if (s.rationale) L.push(`\n${s.rationale}`);
  }

  if (a.invalidation) L.push(`\n### מה יפריך את התרחיש\n${a.invalidation}`);

  if (a.unreadable?.length) {
    L.push(`\n### ⚠️ מגבלות הניתוח`);
    L.push(`הנתונים הבאים לא היו קריאים בתמונה, ולכן לא נלקחו בחשבון:`);
    for (const u of a.unreadable) L.push(`- ${u}`);
  }

  L.push(`\n---\n*אין באמור המלצה להשקעה. המסחר כרוך בסיכון.*`);
  return L.join("\n");
}
