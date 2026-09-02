import { createClient } from "../../../lib/supabase/server";
import ClientEnvCheck from "./ClientEnvCheck";

// Always reflect the live environment, never a value captured at build time.
export const dynamic = "force-dynamic";

const TABLES = ["plans", "user_profiles", "analyses", "user_requests", "trades"] as const;

/** Presence and shape only — never the value, these are secrets. */
function envRow(name: string, value: string | undefined, opts: { reveal?: boolean } = {}) {
  const present = !!value && !value.includes("placeholder");
  return {
    name,
    ok: present,
    detail: !value
      ? "חסר"
      : value.includes("placeholder")
        ? "ערך placeholder"
        : opts.reveal ? value : `מוגדר (${value.length} תווים)`,
  };
}

export default async function HealthPage() {
  const envChecks = [
    envRow("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL, { reveal: true }),
    envRow("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    envRow("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
    envRow("NET_PUBLIC_SITE_URL_OPENAI_API_KEY", process.env.NET_PUBLIC_SITE_URL_OPENAI_API_KEY),
    envRow("NEXT_PUBLIC_SITE_OPENAI_ASSISTANT_ID", process.env.NEXT_PUBLIC_SITE_OPENAI_ASSISTANT_ID, { reveal: true }),
    envRow("NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL, { reveal: true }),
  ];

  // Which project is this deploy actually pointed at?
  const projectRef = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")
    .replace("https://", "").replace(".supabase.co", "") || "(לא ידוע)";

  const tableChecks: Array<{ name: string; ok: boolean; detail: string }> = [];
  let connection = { ok: false, detail: "לא נבדק" };

  // A misconfigured or unreachable Supabase makes each query hang until its own
  // timeout. Serially that exceeds the hosting function limit and this page 504s
  // exactly when it is most needed, so cap every probe and run them together.
  // 6s: generous enough for a cold function reaching a distant region, still
  // comfortably inside the hosting function limit even if every probe stalls.
  const withTimeout = <T,>(p: PromiseLike<T>, ms = 6000): Promise<T | { timedOut: true }> =>
    Promise.race([
      Promise.resolve(p),
      new Promise<{ timedOut: true }>(resolve => setTimeout(() => resolve({ timedOut: true }), ms)),
    ]);

  try {
    const supabase = await createClient();
    const results = await Promise.all(
      TABLES.map(async table => {
        const res: any = await withTimeout(
          supabase.from(table).select("*", { count: "exact", head: true })
        );
        if (res?.timedOut) {
          return { name: table, ok: false, detail: "לא הגיעה תשובה — בדוק את כתובת Supabase" };
        }
        if (!res.error) {
          return { name: table, ok: true, detail: `קיימת (${res.count ?? 0} שורות נראות)` };
        }
        const missing = /does not exist|schema cache|relation/i.test(res.error.message);
        return {
          name: table,
          ok: false,
          detail: missing ? "הטבלה לא קיימת — צריך להריץ את ה-SQL" : res.error.message,
        };
      })
    );
    tableChecks.push(...results);
    connection = tableChecks.some(t => t.ok)
      ? { ok: true, detail: "השרת מצליח לדבר עם Supabase" }
      : { ok: false, detail: "השרת לא מצליח לקרוא אף טבלה" };
  } catch (e: any) {
    connection = { ok: false, detail: e?.message ?? "החיבור נכשל" };
  }

  // Chart analysis needs three things beyond the database: a valid OpenAI key,
  // an assistant that key can actually see, and a storage bucket to hold the
  // upload. A failure in any of them surfaces as the same generic error in the
  // UI, so check each one directly.
  const analysisChecks: Array<{ name: string; ok: boolean; detail: string }> = [];

  const openaiKey = process.env.NET_PUBLIC_SITE_URL_OPENAI_API_KEY;
  const analysisModel = process.env.OPENAI_ANALYSIS_MODEL || "gpt-4o";

  if (!openaiKey) {
    analysisChecks.push({ name: "openai", ok: false, detail: "חסר מפתח OpenAI" });
  } else {
    // Analysis needs this key to be able to reach this specific model, so ask
    // about the model itself rather than about an assistant the code no longer
    // uses. Each status maps to a different fix, so report them apart.
    try {
      const res: any = await withTimeout(
        fetch(`https://api.openai.com/v1/models/${analysisModel}`, {
          headers: { Authorization: `Bearer ${openaiKey}` },
          cache: "no-store",
        })
      );
      if (res?.timedOut) {
        analysisChecks.push({ name: `openai (${analysisModel})`, ok: false, detail: "אין תשובה מ-OpenAI" });
      } else if (res.status === 200) {
        analysisChecks.push({
          name: `openai (${analysisModel})`,
          ok: true,
          detail: "המפתח תקין והמודל זמין",
        });
      } else {
        const body = await res.json().catch(() => ({}));
        const apiMsg = body?.error?.message ? ` — ${body.error.message}` : "";
        const detail =
          res.status === 401 ? `המפתח נדחה (401) — לא תקין או שפג${apiMsg}`
          : res.status === 404 ? `המודל ${analysisModel} לא זמין לחשבון הזה (404)${apiMsg}`
          : res.status === 429 ? `אין יתרה או חריגה ממכסה (429)${apiMsg}`
          : `OpenAI החזיר ${res.status}${apiMsg}`;
        analysisChecks.push({ name: `openai (${analysisModel})`, ok: false, detail });
      }
    } catch (e: any) {
      analysisChecks.push({ name: `openai (${analysisModel})`, ok: false, detail: e?.message ?? "הבדיקה נכשלה" });
    }
  }

  try {
    const supabase = await createClient();
    const res: any = await withTimeout(supabase.storage.from("images").list("", { limit: 1 }));
    if (res?.timedOut) {
      analysisChecks.push({ name: "storage (images)", ok: false, detail: "אין תשובה" });
    } else if (res.error) {
      analysisChecks.push({ name: "storage (images)", ok: false, detail: res.error.message });
    } else {
      analysisChecks.push({ name: "storage (images)", ok: true, detail: "ה-bucket קיים ונגיש" });
    }
  } catch (e: any) {
    analysisChecks.push({ name: "storage (images)", ok: false, detail: e?.message ?? "הבדיקה נכשלה" });
  }

  const Row = ({ ok, name, detail }: { ok: boolean; name: string; detail: string }) => (
    <div style={{
      display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center",
      padding: "10px 14px", borderRadius: 8, background: "#161622", marginBottom: 6,
    }}>
      <span style={{ fontSize: 13, color: ok ? "#4ade80" : "#f87171", textAlign: "left", direction: "ltr", wordBreak: "break-all" }}>
        {detail}
      </span>
      <span style={{ fontFamily: "monospace", fontSize: 13, color: "#fff", whiteSpace: "nowrap" }}>
        {ok ? "✅" : "❌"} {name}
      </span>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0D0D14", color: "#fff", direction: "rtl", padding: "40px 20px" }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: "#F0B90B", marginBottom: 8 }}>
          🩺 בדיקת תקינות המערכת
        </h1>
        <p style={{ color: "#888", marginBottom: 28, fontSize: 14 }}>
          הדף הזה בודק את ההגדרות בזמן אמת. צלם אותו ושלח כדי לאבחן תקלות.
        </p>

        <ClientEnvCheck />

        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>הגדרות בשרת</h2>
        {envChecks.map(c => <Row key={c.name} {...c} />)}

        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "28px 0 12px" }}>
          חיבור לדאטהבייס
          <span style={{ fontSize: 13, color: "#888", fontWeight: 400 }}> — פרויקט: {projectRef}</span>
        </h2>
        <Row ok={connection.ok} name="connection" detail={connection.detail} />

        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "28px 0 12px" }}>טבלאות</h2>
        {tableChecks.map(c => <Row key={c.name} {...c} />)}

        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "28px 0 12px" }}>ניתוח גרפים</h2>
        {analysisChecks.map(c => <Row key={c.name} {...c} />)}

        <p style={{ color: "#555", fontSize: 12, marginTop: 32 }}>
          לא נחשפים כאן ערכים סודיים — רק האם הם מוגדרים.
        </p>
      </div>
    </div>
  );
}
