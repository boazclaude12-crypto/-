"use client";

/**
 * NEXT_PUBLIC_* values are inlined into the browser bundle when it is built,
 * while the server reads them from the live environment. Showing the browser's
 * copy separately is what distinguishes "the variable is missing" from "the
 * variable exists but this bundle was built before it was added".
 */
export default function ClientEnvCheck() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const ok = !!url && !url.includes("placeholder") && !!anon;

  return (
    <div style={{
      background: ok ? "#0f2a17" : "#2a1010",
      border: `1px solid ${ok ? "#4ade8055" : "#f8717155"}`,
      borderRadius: 12, padding: 20, marginBottom: 24,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 12, color: ok ? "#4ade80" : "#f87171" }}>
        {ok ? "✅ הדפדפן מקבל את ההגדרות" : "❌ הדפדפן לא מקבל את ההגדרות"}
      </div>
      <div style={{ fontFamily: "monospace", fontSize: 13, color: "#ccc", direction: "ltr", textAlign: "left" }}>
        <div>SUPABASE_URL (browser): {url || "(missing)"}</div>
        <div>ANON_KEY (browser): {anon ? `set, ${anon.length} chars` : "(missing)"}</div>
      </div>
      {!ok && (
        <div style={{ marginTop: 12, color: "#ffc9c9", fontSize: 14 }}>
          הקוד שרץ בדפדפן נבנה לפני שהמשתנים הוגדרו. צריך בנייה מחדש ב-Vercel
          <b> בלי </b>סימון <code>Use existing Build Cache</code>.
        </div>
      )}
    </div>
  );
}
