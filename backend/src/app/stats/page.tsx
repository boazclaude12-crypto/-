"use client";

import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { Rubik, Heebo } from "next/font/google";
import {
  TrendingUp, TrendingDown, Plus, Trash2, X, ArrowRight,
  Target, Percent, Scale, Activity, AlertTriangle, Trophy, Flame, Wallet,
} from "lucide-react";
import type { StatsSummary, TradeMetrics, Trade } from "../../../lib/tradeStats";

const rubik = Rubik({ subsets: ["latin", "hebrew"] });
const heebo = Heebo({ subsets: ["latin", "hebrew"] });

const GOLD = "#F0B90B";
const ORANGE = "#E05A20";
const GREEN = "#4ade80";
const RED = "#f87171";

type TradeRow = Trade & { metrics: TradeMetrics };

const money = (n: number) =>
  `${n < 0 ? "-" : ""}₪${Math.abs(n).toLocaleString("he-IL", { maximumFractionDigits: 2 })}`;

const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;

const tone = (n: number) => (n > 0 ? GREEN : n < 0 ? RED : "#888");

/** Cumulative P&L drawn as a filled area chart. */
function EquityCurve({ points }: { points: StatsSummary["equityCurve"] }) {
  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center h-48 text-sm" style={{ color: "#666" }}>
        צריך לפחות 2 עסקאות סגורות כדי לצייר את גרף ההון
      </div>
    );
  }

  const W = 800, H = 200, PAD = 8;
  const values = points.map(p => p.equity);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;

  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.equity).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(min)} L${x(0).toFixed(1)},${y(min)} Z`;
  const zeroY = y(0);
  const ending = values[values.length - 1];
  const stroke = ending >= 0 ? GREEN : RED;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 320, height: 200 }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        {zeroY >= 0 && zeroY <= H && (
          <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="#444" strokeWidth="1" strokeDasharray="4 4" />
        )}
        <path d={area} fill="url(#eqFill)" />
        <path d={line} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.equity)} r="3" fill={p.pnl >= 0 ? GREEN : RED}>
            <title>{`${p.symbol}: ${money(p.pnl)} · הון מצטבר ${money(p.equity)}`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

function Kpi({ label, value, sub, color, icon }: {
  label: string; value: string; sub?: string; color?: string; icon: React.ReactNode;
}) {
  return (
    <div className="p-5 rounded-2xl" style={{ background: "#161622", border: "1px solid #F0B90B22" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: "linear-gradient(135deg,#F0B90B22,#E05A2011)", color: GOLD }}>
          {icon}
        </div>
        <span className="text-xs" style={{ color: "#888" }}>{label}</span>
      </div>
      <div className={`text-2xl font-bold ${rubik.className}`} style={{ color: color ?? "#fff" }}>{value}</div>
      {sub && <div className="text-xs mt-1" style={{ color: "#666" }}>{sub}</div>}
    </div>
  );
}

const EMPTY_FORM = {
  symbol: "", direction: "long" as "long" | "short", entry_price: "",
  stop_loss: "", take_profit: "", exit_price: "", position_size: "", notes: "",
};

export default function StatsPage() {
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");

  const load = async () => {
    try {
      const res = await axios.get("/api/trades");
      setTrades(res.data.trades ?? []);
      setStats(res.data.stats ?? null);
      setSetupError(res.data.error ?? null);
    } catch (e: any) {
      if (e?.response?.status === 401) window.location.href = "/?auth=login";
      else setSetupError(e?.message ?? "שגיאה בטעינת הנתונים");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await axios.post("/api/trades", form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (e: any) {
      setFormError(e?.response?.data?.error ?? "שמירת העסקה נכשלה");
    } finally {
      setSaving(false);
    }
  };

  const closeTrade = async (id: string) => {
    const input = window.prompt("מחיר יציאה:");
    if (!input) return;
    try {
      await axios.patch("/api/trades", { id, exit_price: input });
      await load();
    } catch {
      setSetupError("סגירת העסקה נכשלה");
    }
  };

  const removeTrade = async (id: string) => {
    if (!window.confirm("למחוק את העסקה?")) return;
    try {
      await axios.delete(`/api/trades?id=${id}`);
      await load();
    } catch {
      setSetupError("מחיקת העסקה נכשלה");
    }
  };

  const visible = useMemo(
    () => (filter === "all" ? trades : trades.filter(t => t.status === filter)),
    [trades, filter]
  );

  const field = (name: keyof typeof EMPTY_FORM, label: string, placeholder = "", type = "text") => (
    <div>
      <label className="block text-xs mb-1" style={{ color: "#888" }}>{label}</label>
      <input
        type={type}
        inputMode={type === "number" ? "decimal" : undefined}
        step="any"
        value={form[name] as string}
        placeholder={placeholder}
        onChange={e => setForm({ ...form, [name]: e.target.value })}
        className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-1"
        style={{ background: "#0D0D14", border: "1px solid #F0B90B33", color: "#fff" }}
      />
    </div>
  );

  return (
    <div className={`min-h-screen ${heebo.className}`} style={{ background: "#0D0D14", direction: "rtl" }}>
      <header className="sticky top-0 z-30" style={{ background: "#0D0D14", borderBottom: "1px solid #F0B90B22" }}>
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 text-sm" style={{ color: "#888" }}>
            <ArrowRight className="h-4 w-4" />חזרה ללוח הבקרה
          </Link>
          <h1 className={`text-lg font-bold ${rubik.className}`} style={{ color: GOLD }}>
            📊 סטטיסטיקה ומעקב עסקאות
          </h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {setupError && (
          <div className="mb-6 p-4 rounded-xl flex items-start gap-3" style={{ background: "#2a1a1a", border: "1px solid #f8717155" }}>
            <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: RED }} />
            <div className="text-sm" style={{ color: "#ffc9c9" }}>
              <div className="font-bold mb-1">לא הצלחנו לטעון את העסקאות</div>
              <div style={{ color: "#c88" }}>{setupError}</div>
              <div className="mt-2" style={{ color: "#a88" }}>
                אם זו ההפעלה הראשונה — צריך להריץ את <code style={{ color: GOLD }}>backend/supabase/trades.sql</code> ב-Supabase.
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-20" style={{ color: "#666" }}>טוען נתונים...</div>
        ) : (
          <>
            {/* Primary KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <Kpi
                icon={<Wallet className="h-5 w-5" />}
                label="רווח/הפסד כולל"
                value={money(stats?.totalPnl ?? 0)}
                sub={`תשואה ${pct(stats?.totalPnlPct ?? 0)} על ${money(stats?.totalInvested ?? 0)}`}
                color={tone(stats?.totalPnl ?? 0)}
              />
              <Kpi
                icon={<Percent className="h-5 w-5" />}
                label="אחוז הצלחה"
                value={`${stats?.winRate ?? 0}%`}
                sub={`${stats?.wins ?? 0} רווח · ${stats?.losses ?? 0} הפסד`}
                color={GOLD}
              />
              <Kpi
                icon={<Scale className="h-5 w-5" />}
                label="יחס רווח/הפסד"
                value={stats?.profitFactor != null ? stats.profitFactor.toFixed(2) : "—"}
                sub={`רווח ${money(stats?.grossProfit ?? 0)} מול הפסד ${money(stats?.grossLoss ?? 0)}`}
                color={(stats?.profitFactor ?? 0) >= 1 ? GREEN : RED}
              />
              <Kpi
                icon={<Target className="h-5 w-5" />}
                label="יחס סיכון/סיכוי"
                value={stats?.avgPlannedRR != null ? `1:${stats.avgPlannedRR.toFixed(2)}` : "—"}
                sub={stats?.avgRealisedR != null ? `בפועל ${stats.avgRealisedR > 0 ? "+" : ""}${stats.avgRealisedR.toFixed(2)}R לעסקה` : "הגדר סטופ ויעד"}
                color={GOLD}
              />
            </div>

            {/* Equity curve */}
            <div className="p-6 rounded-2xl mb-6" style={{ background: "#161622", border: "1px solid #F0B90B22" }}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs" style={{ color: "#666" }}>
                  {stats?.closedTrades ?? 0} עסקאות סגורות
                </span>
                <h2 className={`text-lg font-bold ${rubik.className}`} style={{ color: "#fff" }}>עקומת הון מצטברת</h2>
              </div>
              <EquityCurve points={stats?.equityCurve ?? []} />
            </div>

            {/* Secondary stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
              {[
                { label: "ממוצע רווח", value: pct(stats?.avgWinPct ?? 0), color: GREEN, icon: <TrendingUp className="h-4 w-4" /> },
                { label: "ממוצע הפסד", value: pct(stats?.avgLossPct ?? 0), color: RED, icon: <TrendingDown className="h-4 w-4" /> },
                { label: "תוחלת לעסקה", value: money(stats?.expectancy ?? 0), color: tone(stats?.expectancy ?? 0), icon: <Activity className="h-4 w-4" /> },
                { label: "ירידה מקסימלית", value: money(stats?.maxDrawdown ?? 0), color: RED, icon: <AlertTriangle className="h-4 w-4" /> },
                {
                  label: "העסקה הטובה", value: stats?.bestTrade ? pct(stats.bestTrade.pnlPct) : "—",
                  color: GREEN, icon: <Trophy className="h-4 w-4" />, sub: stats?.bestTrade?.symbol,
                },
                {
                  label: "רצף נוכחי",
                  value: stats?.currentStreak ? `${Math.abs(stats.currentStreak)} ${stats.currentStreak > 0 ? "רווח" : "הפסד"}` : "—",
                  color: (stats?.currentStreak ?? 0) > 0 ? GREEN : RED, icon: <Flame className="h-4 w-4" />,
                },
              ].map(s => (
                <div key={s.label} className="p-4 rounded-xl text-right" style={{ background: "#161622", border: "1px solid #F0B90B1A" }}>
                  <div className="flex items-center justify-end gap-1.5 mb-2 text-xs" style={{ color: "#777" }}>
                    {s.label}<span style={{ color: GOLD }}>{s.icon}</span>
                  </div>
                  <div className={`text-lg font-bold ${rubik.className}`} style={{ color: s.color }}>{s.value}</div>
                  {"sub" in s && s.sub && <div className="text-xs mt-0.5" style={{ color: "#666" }}>{s.sub}</div>}
                </div>
              ))}
            </div>

            {/* Per-symbol breakdown */}
            {!!stats?.bySymbol.length && (
              <div className="p-6 rounded-2xl mb-6" style={{ background: "#161622", border: "1px solid #F0B90B22" }}>
                <h2 className={`text-lg font-bold mb-4 ${rubik.className}`} style={{ color: "#fff" }}>פילוח לפי נכס</h2>
                <div className="space-y-3">
                  {stats.bySymbol.map(s => {
                    const peak = Math.max(...stats.bySymbol.map(x => Math.abs(x.pnl)), 1);
                    return (
                      <div key={s.symbol} className="flex items-center gap-4">
                        <span className="w-20 text-sm font-bold" style={{ color: "#fff" }}>{s.symbol}</span>
                        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "#0D0D14" }}>
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${(Math.abs(s.pnl) / peak) * 100}%`, background: s.pnl >= 0 ? GREEN : RED }} />
                        </div>
                        <span className="w-16 text-xs text-left" style={{ color: "#888" }}>{s.winRate}%</span>
                        <span className="w-24 text-sm font-bold text-left" style={{ color: tone(s.pnl) }}>{money(s.pnl)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Trades list */}
            <div className="p-6 rounded-2xl" style={{ background: "#161622", border: "1px solid #F0B90B22" }}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div className="flex gap-2">
                  {([["all", "הכל"], ["open", "פתוחות"], ["closed", "סגורות"]] as const).map(([k, label]) => (
                    <button key={k} onClick={() => setFilter(k)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={{
                        background: filter === k ? GOLD : "transparent",
                        color: filter === k ? "#000" : "#888",
                        border: `1px solid ${filter === k ? GOLD : "#333"}`,
                      }}>
                      {label}
                    </button>
                  ))}
                </div>
                <button onClick={() => setShowForm(true)}
                  className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5"
                  style={{ background: `linear-gradient(90deg,${GOLD},${ORANGE})`, color: "#000" }}>
                  <Plus className="h-4 w-4" />הוסף עסקה
                </button>
              </div>

              {!visible.length ? (
                <div className="text-center py-12" style={{ color: "#666" }}>
                  <div className="mb-2">אין עסקאות להצגה</div>
                  <div className="text-sm">הוסף את העסקה הראשונה כדי להתחיל לעקוב אחרי הביצועים שלך</div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ minWidth: 720 }}>
                    <thead>
                      <tr style={{ color: "#666" }} className="text-xs">
                        {["נכס", "כיוון", "כניסה", "יציאה", "סטופ/יעד", "גודל", "תשואה", "R", ""].map(h => (
                          <th key={h} className="py-2 px-2 text-right font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map(t => (
                        <tr key={t.id} style={{ borderTop: "1px solid #ffffff0d" }}>
                          <td className="py-3 px-2 font-bold" style={{ color: "#fff" }}>
                            {t.symbol}
                            {t.status === "open" && (
                              <span className="mr-2 text-xs px-1.5 py-0.5 rounded" style={{ background: "#F0B90B22", color: GOLD }}>פתוחה</span>
                            )}
                          </td>
                          <td className="py-3 px-2">
                            <span style={{ color: t.direction === "long" ? GREEN : RED }}>
                              {t.direction === "long" ? "לונג" : "שורט"}
                            </span>
                          </td>
                          <td className="py-3 px-2" style={{ color: "#ccc" }}>{t.entry_price}</td>
                          <td className="py-3 px-2" style={{ color: "#ccc" }}>{t.exit_price ?? "—"}</td>
                          <td className="py-3 px-2 text-xs" style={{ color: "#777" }}>
                            {t.stop_loss ?? "—"} / {t.take_profit ?? "—"}
                          </td>
                          <td className="py-3 px-2" style={{ color: "#ccc" }}>{money(t.position_size)}</td>
                          <td className="py-3 px-2 font-bold" style={{ color: t.status === "closed" ? tone(t.metrics.pnlPct) : "#666" }}>
                            {t.status === "closed" ? `${pct(t.metrics.pnlPct)} (${money(t.metrics.pnlAmount)})` : "—"}
                          </td>
                          <td className="py-3 px-2" style={{ color: t.metrics.realisedR != null ? tone(t.metrics.realisedR) : "#666" }}>
                            {t.metrics.realisedR != null
                              ? `${t.metrics.realisedR > 0 ? "+" : ""}${t.metrics.realisedR}R`
                              : t.metrics.plannedRR != null ? `יעד 1:${t.metrics.plannedRR}` : "—"}
                          </td>
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-2 justify-end">
                              {t.status === "open" && (
                                <button onClick={() => closeTrade(t.id)} className="text-xs px-2 py-1 rounded"
                                  style={{ background: "#F0B90B22", color: GOLD }}>
                                  סגור
                                </button>
                              )}
                              <button onClick={() => removeTrade(t.id)} aria-label="מחק עסקה" style={{ color: "#666" }}>
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Add-trade form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "#000000cc" }}
          onClick={() => setShowForm(false)}>
          <div className="w-full max-w-lg rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
            style={{ background: "#161622", border: "1px solid #F0B90B44" }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <button onClick={() => setShowForm(false)} aria-label="סגור" style={{ color: "#666" }}>
                <X className="h-5 w-5" />
              </button>
              <h2 className={`text-lg font-bold ${rubik.className}`} style={{ color: GOLD }}>הוספת עסקה</h2>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {field("symbol", "נכס *", "BTC/USD")}
                <div>
                  <label className="block text-xs mb-1" style={{ color: "#888" }}>כיוון</label>
                  <div className="flex gap-2">
                    {([["long", "לונג"], ["short", "שורט"]] as const).map(([v, label]) => (
                      <button key={v} type="button" onClick={() => setForm({ ...form, direction: v })}
                        className="flex-1 py-2 rounded-lg text-sm font-medium"
                        style={{
                          background: form.direction === v ? (v === "long" ? GREEN : RED) : "transparent",
                          color: form.direction === v ? "#000" : "#888",
                          border: `1px solid ${form.direction === v ? "transparent" : "#333"}`,
                        }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {field("entry_price", "מחיר כניסה *", "69200", "number")}
                {field("position_size", "גודל פוזיציה (₪)", "1000", "number")}
                {field("stop_loss", "סטופ לוס", "68100", "number")}
                {field("take_profit", "טייק פרופיט", "72500", "number")}
                {field("exit_price", "מחיר יציאה (השאר ריק לעסקה פתוחה)", "", "number")}
                {field("notes", "הערות", "")}
              </div>

              {formError && <div className="text-sm" style={{ color: RED }}>{formError}</div>}

              <button type="submit" disabled={saving}
                className="w-full py-3 rounded-xl font-bold disabled:opacity-50"
                style={{ background: `linear-gradient(90deg,${GOLD},${ORANGE})`, color: "#000" }}>
                {saving ? "שומר..." : "שמור עסקה"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
