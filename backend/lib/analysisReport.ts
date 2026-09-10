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
  stop_level_id: string | null;
  target_level_id: string | null;
  stop_distance_pct: number | null;
  counter_structure: boolean;
  no_trade_reason: string | null;
  rationale: string;
}

export interface AnalysisLevel {
  id: string;
  kind: "תמיכה" | "התנגדות";
  low: number;
  high: number;
  touches: number;
  touch_type: string;
  strength: string;
}

export interface StructuredAnalysis {
  is_chart: boolean;
  asset: string;
  timeframe: string;
  price_axis: { readable: boolean; low: number | null; high: number | null; precision: number | null };
  last_price: number | null;
  structure: {
    swing_points: Array<{ kind: string; price: number }>;
    trend: string;
    strength: string;
    phase: string;
    location: string;
    last_break: { happened: boolean; confirmed_by_close: boolean; note: string };
  };
  levels: AnalysisLevel[];
  indicators: string[];
  volume_note: string;
  scenario: AnalysisScenario;
  position_sizing_note: string;
  invalidation: string;
  confidence: string;
  unreadable: string[];
  summary: string;
}

const DIRECTION_HE: Record<string, string> = {
  long: "לונג (קנייה)",
  short: "שורט (מכירה)",
  none: "אין עסקה",
};

const CONFIDENCE_MARK: Record<string, string> = {
  גבוהה: "🟢",
  בינונית: "🟡",
  נמוכה: "🔴",
};

const fmt = (n: number) => n.toLocaleString("he-IL", { maximumFractionDigits: 8 });

/** A level is a zone; collapse it to one number only when it genuinely is one. */
const zone = (l: AnalysisLevel) =>
  l.low === l.high ? fmt(l.low) : `${fmt(l.low)}–${fmt(l.high)}`;

export function renderAnalysis(a: any): string {
  if (a?.is_chart === false) {
    return `**לא זוהה גרף מסחר בתמונה**\n\n${a.summary ?? "נסה להעלות צילום מסך של גרף מסחר."}`;
  }

  const L: string[] = [];
  const s = a.structure ?? {};
  const sc = a.scenario ?? {};
  const levels: AnalysisLevel[] = a.levels ?? [];

  L.push(`## ${a.asset || "ניתוח גרף"}${a.timeframe ? ` · ${a.timeframe}` : ""}`);
  if (a.summary) L.push(a.summary);

  const head: string[] = [];
  if (s.trend) head.push(`**מגמה:** ${s.trend}${s.strength && s.strength !== "לא ברור" ? ` (${s.strength})` : ""}`);
  if (s.phase && s.phase !== "לא ברור") head.push(`**שלב:** ${s.phase}`);
  if (a.last_price != null) head.push(`**מחיר אחרון:** ${fmt(a.last_price)}`);
  head.push(`**ביטחון:** ${CONFIDENCE_MARK[a.confidence] ?? ""} ${a.confidence}`);
  L.push("\n" + head.join(" · "));

  // A break that never closed beyond the level is a liquidity sweep, and saying
  // so is the difference between a real signal and a trap.
  if (s.last_break?.happened) {
    L.push(
      s.last_break.confirmed_by_close
        ? `\n**שבירת מבנה מאושרת בסגירה.** ${s.last_break.note ?? ""}`.trim()
        : `\n⚠️ **הרמה נחדרה בפתיל בלבד ולא בסגירה** — איסוף נזילות, לא שבירה. ${s.last_break.note ?? ""}`.trim()
    );
  }

  if (levels.length) {
    L.push(`\n### רמות מפתח`);
    L.push(`| רמה | סוג | מגעים | עוצמה |`);
    L.push(`|---|---|---|---|`);
    for (const l of levels) {
      L.push(`| ${zone(l)} | ${l.kind} | ${l.touches} (${l.touch_type}) | ${l.strength} |`);
    }
  }

  if (a.indicators?.length || a.volume_note) {
    L.push(`\n### נפח ואינדיקטורים`);
    for (const i of a.indicators ?? []) L.push(`- ${i}`);
    if (a.volume_note) L.push(`- **נפח:** ${a.volume_note}`);
  }

  L.push(`\n### תרחיש מסחר`);
  if (sc.direction === "none") {
    L.push(`**אין עסקה — המבנה אינו מצדיק כניסה.**`);
    if (sc.no_trade_reason) L.push(`\n**הסיבה:** ${sc.no_trade_reason}`);
    if (sc.rationale) L.push(sc.rationale);
  } else {
    L.push(`**כיוון:** ${DIRECTION_HE[sc.direction] ?? sc.direction}`);
    if (sc.counter_structure) L.push(`⚠️ עסקה נגד המגמה הראשית — סיכון מוגבר.`);

    const rows: string[] = [];
    if (sc.entry != null) rows.push(`| כניסה | ${fmt(sc.entry)} |`);
    if (sc.stop_loss != null) {
      const pct = sc.stop_distance_pct != null ? ` (${sc.stop_distance_pct}% מהמחיר)` : "";
      rows.push(`| סטופ לוס | ${fmt(sc.stop_loss)}${pct} |`);
    }
    if (sc.take_profit != null) rows.push(`| טייק פרופיט | ${fmt(sc.take_profit)} |`);
    if (sc.risk_reward != null) rows.push(`| יחס סיכון/סיכוי | 1:${sc.risk_reward} |`);
    if (rows.length) L.push(`\n| | |\n|---|---|\n${rows.join("\n")}`);
    if (sc.rationale) L.push(`\n${sc.rationale}`);
  }

  if (a.position_sizing_note) L.push(`\n### גודל פוזיציה\n${a.position_sizing_note}`);
  if (a.invalidation) L.push(`\n### מה יפריך את התרחיש\n${a.invalidation}`);

  // Anything the image could not support belongs in the report, not buried.
  const gaps = [...(a.unreadable ?? [])];
  if (a.price_axis && a.price_axis.readable === false) {
    gaps.unshift("ציר המחיר אינו קריא — לא ניתן לגזור מספרים מהגרף");
  }
  if (gaps.length) {
    L.push(`\n### ⚠️ מגבלות הניתוח`);
    L.push(`הנתונים הבאים לא היו קריאים בתמונה, ולכן לא נלקחו בחשבון:`);
    for (const u of gaps) L.push(`- ${u}`);
  }

  L.push(`\n---\n*אין באמור המלצה להשקעה. המסחר כרוך בסיכון.*`);
  return L.join("\n");
}
