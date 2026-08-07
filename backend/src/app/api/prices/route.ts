import { NextResponse } from "next/server";

export const revalidate = 60;

const COINS = "bitcoin,ethereum,solana,ripple,cardano,dogecoin";

const FALLBACK = [
  { id: "bitcoin", symbol: "BTC", price: 0, change24h: 0 },
  { id: "ethereum", symbol: "ETH", price: 0, change24h: 0 },
  { id: "solana", symbol: "SOL", price: 0, change24h: 0 },
  { id: "ripple", symbol: "XRP", price: 0, change24h: 0 },
  { id: "cardano", symbol: "ADA", price: 0, change24h: 0 },
  { id: "dogecoin", symbol: "DOGE", price: 0, change24h: 0 },
];

const SYMBOLS: Record<string, string> = {
  bitcoin: "BTC",
  ethereum: "ETH",
  solana: "SOL",
  ripple: "XRP",
  cardano: "ADA",
  dogecoin: "DOGE",
};

export async function GET() {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${COINS}&vs_currencies=usd&include_24hr_change=true`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const data = await res.json();

    const prices = Object.keys(SYMBOLS)
      .filter((id) => data[id])
      .map((id) => ({
        id,
        symbol: SYMBOLS[id],
        price: data[id].usd as number,
        change24h: (data[id].usd_24h_change as number) ?? 0,
      }));

    return NextResponse.json({ prices });
  } catch {
    return NextResponse.json({ prices: FALLBACK, stale: true });
  }
}
