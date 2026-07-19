import { NextResponse } from 'next/server';

const COINS = [
  { id: 'bitcoin', symbol: 'BTCUSDT', name: 'Bitcoin' },
  { id: 'ethereum', symbol: 'ETHUSDT', name: 'Ethereum' },
  { id: 'solana', symbol: 'SOLUSDT', name: 'Solana' },
  { id: 'binancecoin', symbol: 'BNBUSDT', name: 'BNB' },
  { id: 'ripple', symbol: 'XRPUSDT', name: 'XRP' },
  { id: 'cardano', symbol: 'ADAUSDT', name: 'Cardano' },
  { id: 'dogecoin', symbol: 'DOGEUSDT', name: 'Dogecoin' },
  { id: 'avalanche-2', symbol: 'AVAXUSDT', name: 'Avalanche' },
  { id: 'chainlink', symbol: 'LINKUSDT', name: 'Chainlink' },
  { id: 'polkadot', symbol: 'DOTUSDT', name: 'Polkadot' },
];

export const revalidate = 60; // cache 60 s

export async function GET() {
  try {
    const ids = COINS.map(c => c.id).join(',');
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`,
      { next: { revalidate: 60 } }
    );

    if (!res.ok) throw new Error('CoinGecko error');
    const data = await res.json();

    const prices = COINS.map(coin => {
      const info = data[coin.id] ?? {};
      return {
        symbol: coin.symbol,
        name: coin.name,
        price: info.usd ?? 0,
        change_24h_percent: info.usd_24h_change ?? 0,
        market_cap: info.usd_market_cap ?? undefined,
      };
    });

    return NextResponse.json(prices);
  } catch {
    return NextResponse.json({ error: 'prices_unavailable', message: 'Could not fetch prices' }, { status: 503 });
  }
}
