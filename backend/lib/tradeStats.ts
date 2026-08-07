export type Direction = "long" | "short";
export type TradeStatus = "open" | "closed";

export interface Trade {
  id: string;
  symbol: string;
  asset_type?: string | null;
  direction: Direction;
  entry_price: number;
  stop_loss?: number | null;
  take_profit?: number | null;
  exit_price?: number | null;
  position_size: number;
  status: TradeStatus;
  opened_at: string;
  closed_at?: string | null;
  notes?: string | null;
}

export interface TradeMetrics {
  /** Percentage move in the trade's favour. Negative when the trade lost. */
  pnlPct: number;
  /** Money made or lost, i.e. position_size * pnlPct / 100. */
  pnlAmount: number;
  /** Planned reward-to-risk from the entry, stop and target. Null without both levels. */
  plannedRR: number | null;
  /** Realised result in units of the risk taken (R-multiple). Null without a stop. */
  realisedR: number | null;
}

export interface EquityPoint {
  date: string;
  /** Cumulative money P&L up to and including this trade. */
  equity: number;
  pnl: number;
  symbol: string;
}

export interface StatsSummary {
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  wins: number;
  losses: number;
  breakEven: number;
  winRate: number;
  totalPnl: number;
  totalInvested: number;
  totalPnlPct: number;
  avgWinPct: number;
  avgLossPct: number;
  avgPnlPct: number;
  grossProfit: number;
  grossLoss: number;
  /** Gross profit divided by gross loss. Null when there are no losses to divide by. */
  profitFactor: number | null;
  /** Average planned reward-to-risk across trades that defined a stop and a target. */
  avgPlannedRR: number | null;
  /** Average realised R-multiple across closed trades that defined a stop. */
  avgRealisedR: number | null;
  /** Average win divided by average loss, both in money. Null without both. */
  expectancy: number;
  bestTrade: { symbol: string; pnlPct: number; pnlAmount: number } | null;
  worstTrade: { symbol: string; pnlPct: number; pnlAmount: number } | null;
  /** Largest peak-to-trough drop of the cumulative equity curve, in money. */
  maxDrawdown: number;
  /** Consecutive wins (positive) or losses (negative) at the end of the series. */
  currentStreak: number;
  longestWinStreak: number;
  longestLossStreak: number;
  equityCurve: EquityPoint[];
  bySymbol: Array<{ symbol: string; trades: number; pnl: number; winRate: number }>;
}

const round = (n: number, places = 2) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/**
 * Per-trade result. An open trade has no exit yet, so its P&L is zero and only
 * the planned reward-to-risk is meaningful.
 */
export function computeTradeMetrics(trade: Trade): TradeMetrics {
  const { entry_price: entry, exit_price: exit, stop_loss: stop, take_profit: target } = trade;
  const isLong = trade.direction === "long";

  let plannedRR: number | null = null;
  if (stop != null && target != null && entry > 0) {
    const risk = Math.abs(entry - stop);
    const reward = Math.abs(target - entry);
    if (risk > 0) plannedRR = round(reward / risk);
  }

  if (trade.status !== "closed" || exit == null || entry <= 0) {
    return { pnlPct: 0, pnlAmount: 0, plannedRR, realisedR: null };
  }

  const move = isLong ? exit - entry : entry - exit;
  const pnlPct = (move / entry) * 100;
  const pnlAmount = (trade.position_size * pnlPct) / 100;

  let realisedR: number | null = null;
  if (stop != null) {
    const riskPerUnit = Math.abs(entry - stop);
    if (riskPerUnit > 0) realisedR = round(move / riskPerUnit);
  }

  return {
    pnlPct: round(pnlPct),
    pnlAmount: round(pnlAmount),
    plannedRR,
    realisedR,
  };
}

const EMPTY: StatsSummary = {
  totalTrades: 0, openTrades: 0, closedTrades: 0,
  wins: 0, losses: 0, breakEven: 0, winRate: 0,
  totalPnl: 0, totalInvested: 0, totalPnlPct: 0,
  avgWinPct: 0, avgLossPct: 0, avgPnlPct: 0,
  grossProfit: 0, grossLoss: 0, profitFactor: null,
  avgPlannedRR: null, avgRealisedR: null, expectancy: 0,
  bestTrade: null, worstTrade: null,
  maxDrawdown: 0, currentStreak: 0, longestWinStreak: 0, longestLossStreak: 0,
  equityCurve: [], bySymbol: [],
};

const average = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function computeStats(trades: Trade[]): StatsSummary {
  if (!trades.length) return { ...EMPTY };

  const open = trades.filter(t => t.status === "open");
  const closed = trades
    .filter(t => t.status === "closed" && t.exit_price != null)
    .sort((a, b) => new Date(a.closed_at ?? a.opened_at).getTime() - new Date(b.closed_at ?? b.opened_at).getTime());

  const results = closed.map(t => ({ trade: t, ...computeTradeMetrics(t) }));

  const winning = results.filter(r => r.pnlAmount > 0);
  const losing = results.filter(r => r.pnlAmount < 0);
  const flat = results.filter(r => r.pnlAmount === 0);

  const grossProfit = winning.reduce((s, r) => s + r.pnlAmount, 0);
  const grossLoss = Math.abs(losing.reduce((s, r) => s + r.pnlAmount, 0));
  const totalPnl = grossProfit - grossLoss;
  const totalInvested = closed.reduce((s, t) => s + t.position_size, 0);

  // Equity curve, plus the deepest peak-to-trough drop along it.
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const equityCurve: EquityPoint[] = results.map(r => {
    equity += r.pnlAmount;
    if (equity > peak) peak = equity;
    const drawdown = peak - equity;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    return {
      date: r.trade.closed_at ?? r.trade.opened_at,
      equity: round(equity),
      pnl: r.pnlAmount,
      symbol: r.trade.symbol,
    };
  });

  // Streaks, walking the closed trades in chronological order.
  let currentStreak = 0;
  let longestWinStreak = 0;
  let longestLossStreak = 0;
  let run = 0;
  for (const r of results) {
    if (r.pnlAmount > 0) run = run > 0 ? run + 1 : 1;
    else if (r.pnlAmount < 0) run = run < 0 ? run - 1 : -1;
    else run = 0;
    longestWinStreak = Math.max(longestWinStreak, run);
    longestLossStreak = Math.min(longestLossStreak, run);
    currentStreak = run;
  }

  const sortedByPct = [...results].sort((a, b) => b.pnlPct - a.pnlPct);
  const best = sortedByPct[0];
  const worst = sortedByPct[sortedByPct.length - 1];

  const plannedRRs = trades.map(computeTradeMetrics).map(m => m.plannedRR).filter((v): v is number => v != null);
  const realisedRs = results.map(r => r.realisedR).filter((v): v is number => v != null);

  const avgWinAmount = average(winning.map(r => r.pnlAmount));
  const avgLossAmount = Math.abs(average(losing.map(r => r.pnlAmount)));
  const winRate = results.length ? (winning.length / results.length) * 100 : 0;

  // Expectancy: money expected per trade, given this win rate and these averages.
  const p = winRate / 100;
  const expectancy = results.length ? p * avgWinAmount - (1 - p) * avgLossAmount : 0;

  const bySymbolMap = new Map<string, { trades: number; pnl: number; wins: number }>();
  for (const r of results) {
    const key = r.trade.symbol.toUpperCase();
    const acc = bySymbolMap.get(key) ?? { trades: 0, pnl: 0, wins: 0 };
    acc.trades += 1;
    acc.pnl += r.pnlAmount;
    if (r.pnlAmount > 0) acc.wins += 1;
    bySymbolMap.set(key, acc);
  }
  const bySymbol = [...bySymbolMap.entries()]
    .map(([symbol, a]) => ({
      symbol,
      trades: a.trades,
      pnl: round(a.pnl),
      winRate: round((a.wins / a.trades) * 100, 1),
    }))
    .sort((a, b) => b.pnl - a.pnl);

  return {
    totalTrades: trades.length,
    openTrades: open.length,
    closedTrades: results.length,
    wins: winning.length,
    losses: losing.length,
    breakEven: flat.length,
    winRate: round(winRate, 1),
    totalPnl: round(totalPnl),
    totalInvested: round(totalInvested),
    totalPnlPct: totalInvested > 0 ? round((totalPnl / totalInvested) * 100) : 0,
    avgWinPct: round(average(winning.map(r => r.pnlPct))),
    avgLossPct: round(average(losing.map(r => r.pnlPct))),
    avgPnlPct: round(average(results.map(r => r.pnlPct))),
    grossProfit: round(grossProfit),
    grossLoss: round(grossLoss),
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss) : null,
    avgPlannedRR: plannedRRs.length ? round(average(plannedRRs)) : null,
    avgRealisedR: realisedRs.length ? round(average(realisedRs)) : null,
    expectancy: round(expectancy),
    bestTrade: best ? { symbol: best.trade.symbol, pnlPct: best.pnlPct, pnlAmount: best.pnlAmount } : null,
    worstTrade: worst ? { symbol: worst.trade.symbol, pnlPct: worst.pnlPct, pnlAmount: worst.pnlAmount } : null,
    maxDrawdown: round(maxDrawdown),
    currentStreak,
    longestWinStreak,
    longestLossStreak: Math.abs(longestLossStreak),
    equityCurve,
    bySymbol,
  };
}
