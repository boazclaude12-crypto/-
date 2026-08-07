import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { computeStats, computeTradeMetrics, Trade } from "../../../../lib/tradeStats";

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("trades")
    .select("*")
    .eq("user_id", user.id)
    .order("opened_at", { ascending: false });

  if (error) {
    // The table may not exist yet; report it without breaking the page.
    return NextResponse.json({ error: error.message, trades: [], stats: computeStats([]) }, { status: 200 });
  }

  const trades = (data ?? []) as Trade[];
  const withMetrics = trades.map(t => ({ ...t, metrics: computeTradeMetrics(t) }));

  return NextResponse.json({ trades: withMetrics, stats: computeStats(trades) });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const symbol = typeof body.symbol === "string" ? body.symbol.trim().slice(0, 40) : "";
  const entry = num(body.entry_price);
  const size = num(body.position_size) ?? 0;
  const direction = body.direction === "short" ? "short" : "long";

  if (!symbol) return NextResponse.json({ error: "חסר שם נכס" }, { status: 400 });
  if (entry === null || entry <= 0) return NextResponse.json({ error: "מחיר כניסה לא תקין" }, { status: 400 });
  if (size < 0) return NextResponse.json({ error: "גודל פוזיציה לא תקין" }, { status: 400 });

  const exit = num(body.exit_price);
  const status = exit !== null && exit > 0 ? "closed" : "open";

  const row = {
    user_id: user.id,
    symbol,
    asset_type: typeof body.asset_type === "string" ? body.asset_type.slice(0, 40) : null,
    direction,
    entry_price: entry,
    stop_loss: num(body.stop_loss),
    take_profit: num(body.take_profit),
    exit_price: exit,
    position_size: size,
    status,
    notes: typeof body.notes === "string" ? body.notes.slice(0, 1000) : null,
    opened_at: body.opened_at || new Date().toISOString(),
    closed_at: status === "closed" ? (body.closed_at || new Date().toISOString()) : null,
  };

  const { data, error } = await supabase.from("trades").insert([row]).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ trade: { ...data, metrics: computeTradeMetrics(data as Trade) } });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if ("exit_price" in body) {
    const exit = num(body.exit_price);
    patch.exit_price = exit;
    patch.status = exit !== null && exit > 0 ? "closed" : "open";
    patch.closed_at = patch.status === "closed" ? (body.closed_at || new Date().toISOString()) : null;
  }
  if ("stop_loss" in body) patch.stop_loss = num(body.stop_loss);
  if ("take_profit" in body) patch.take_profit = num(body.take_profit);
  if ("notes" in body) patch.notes = typeof body.notes === "string" ? body.notes.slice(0, 1000) : null;

  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { data, error } = await supabase
    .from("trades")
    .update(patch)
    .eq("id", body.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ trade: { ...data, metrics: computeTradeMetrics(data as Trade) } });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase.from("trades").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
