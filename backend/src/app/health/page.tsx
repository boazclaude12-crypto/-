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
  const withTimeout = <T,>(p: PromiseLike<T>, ms = 3000): Promise<T | { timedOut: true }> =>
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

        <p style={{ color: "#555", fontSize: 12, marginTop: 32 }}>
          לא נחשפים כאן ערכים סודיים — רק האם הם מוגדרים.
        </p>
      </div>
    </div>
  );
}
