import { NextResponse } from 'next/server';

const COINGECKO_IDS: Record<string, string> = {
  BTCUSDT: 'bitcoin',
  ETHUSDT: 'ethereum',
  SOLUSDT: 'solana',
  BNBUSDT: 'binancecoin',
  XRPUSDT: 'ripple',
  ADAUSDT: 'cardano',
  DOGEUSDT: 'dogecoin',
  AVAXUSDT: 'avalanche-2',
  LINKUSDT: 'chainlink',
  DOTUSDT: 'polkadot',
};

const RANGE_DAYS: Record<string, string> = {
  '1h': '1',
  '24h': '1',
  '7d': '7',
  '30d': '30',
};

export const revalidate = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const { searchParams } = new URL(request.url);
  const range = searchParams.get('range') ?? '24h';
  const days = RANGE_DAYS[range] ?? '1';
  const coinId = COINGECKO_IDS[symbol.toUpperCase()];

  if (!coinId) {
    return NextResponse.json({ error: 'not_found', message: `Unknown symbol: ${symbol}` }, { status: 404 });
  }

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const json = await res.json();
    const points = (json.prices as [number, number][]).map(([t, price]) => ({ t, price }));
    return NextResponse.json({ symbol, range, points });
  } catch {
    return NextResponse.json({ error: 'upstream_error', message: 'Price data unavailable.' }, { status: 503 });
  }
}
