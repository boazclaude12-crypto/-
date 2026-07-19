import type {
  Analysis,
  Lesson,
  PriceAlert,
  PriceListItem,
  SubscriptionPlan,
  SubscriptionStatus,
  User,
} from '../types';

/** Mutable in-memory store backing the mock API for a single app session. */

export interface MockUserRecord {
  user: User;
  password: string;
  token: string;
}

export const db = {
  // email -> record
  users: new Map<string, MockUserRecord>(),
  // token -> email
  sessions: new Map<string, string>(),
  analyses: [] as Analysis[],
  alerts: [] as PriceAlert[],
  pushTokens: [] as string[],
  // Subscription/usage state for the (single) mock user.
  usedToday: 1,
};

/** Seed one ready-to-use account so login works out of the box. */
export function seed(): void {
  if (db.users.size > 0) return;

  const user: User = {
    id: 'usr_demo',
    email: 'demo@cryptoai.app',
    created_at: '2026-01-10T08:00:00.000Z',
  };
  const token = 'mock-token-demo';
  db.users.set(user.email, { user, password: 'password123', token });
  db.sessions.set(token, user.email);

  db.analyses.push(
    {
      id: 'an_1001',
      created_at: '2026-06-17T14:22:00.000Z',
      image_url: 'https://picsum.photos/seed/btc/800/450',
      symbol: 'BTCUSDT',
      type: 'crypto',
      explanation:
        '## BTC/USDT Analysis\n\nPrice reclaimed the 64.5k support with rising volume and a bullish RSI divergence on the 4H.\n\n### Bias\n\n- **Direction**: Long\n- **Entry zone**: ~64,850\n- **Target**: 68,200 liquidity pocket\n- **Stop**: Below 63,100\n\nStructure favors continuation while price holds above the 64.5k level.',
    },
    {
      id: 'an_1000',
      created_at: '2026-06-16T09:05:00.000Z',
      image_url: 'https://picsum.photos/seed/eth/800/450',
      symbol: 'ETHUSDT',
      type: 'crypto',
      explanation:
        '## ETH/USDT Analysis\n\nRejection at the 3.5k range high with a lower-high formation. Momentum is cooling.\n\n### Bias\n\n- **Direction**: Short\n- **Entry zone**: ~3,520\n- **Target**: 3,280\n- **Stop**: Above 3,640\n\nShort bias is valid while price stays under the 3.64k level.',
    }
  );

  // Older entries for history scrolling.
  const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
  for (let i = 0; i < 14; i++) {
    db.analyses.push({
      id: `an_${900 - i}`,
      created_at: new Date(Date.UTC(2026, 5, 15 - i, 10, 0, 0)).toISOString(),
      image_url: `https://picsum.photos/seed/hist${i}/800/450`,
      symbol: symbols[i % symbols.length],
      type: 'crypto',
      explanation:
        i % 2 === 0
          ? 'Higher-low structure with reclaimed support; targeting the next resistance zone.'
          : 'Lower-high rejection at resistance; targeting the next demand zone.',
    });
  }

  db.alerts.push({
    id: 'al_001',
    symbol: 'BTCUSDT',
    direction: 'up',
    threshold_percent: 5,
    timeframe: '24h',
    active: true,
    created_at: '2026-06-15T12:00:00.000Z',
  });
}

export const PLANS: SubscriptionPlan[] = [
  {
    id: 'plan_free',
    tier: 'free',
    name: 'Free',
    price: 0,
    currency: 'USD',
    period: 'month',
    daily_limit: 5,
    features: ['5 chart analyses / day', 'Live prices'],
  },
  {
    id: 'plan_pro',
    tier: 'pro',
    name: 'Pro',
    price: 14.99,
    currency: 'USD',
    period: 'month',
    daily_limit: 10,
    features: ['10 analyses / day', 'Price alerts', 'Learning section'],
    apple_product_id: 'com.cryptoai.app.pro.monthly',
    google_product_id: 'cryptoai_pro_monthly',
  },
  {
    id: 'plan_premium',
    tier: 'premium',
    name: 'Premium',
    price: 29.99,
    currency: 'USD',
    period: 'month',
    daily_limit: 25,
    features: ['25 analyses / day', 'Priority analysis', 'All Pro features'],
    apple_product_id: 'com.cryptoai.app.premium.monthly',
    google_product_id: 'cryptoai_premium_monthly',
  },
];

/** Daily limit per tier. */
export const TIER_LIMIT: Record<SubscriptionStatus['tier'], number> = {
  free: 5,
  pro: 10,
  premium: 25,
};

/** Builds the current subscription status, reflecting live usage. */
export function currentSubscription(): SubscriptionStatus {
  const tier: SubscriptionStatus['tier'] = 'pro';
  return {
    tier,
    active: true,
    // Existing website payers are recognized as active without IAP.
    source: 'web',
    daily_limit: TIER_LIMIT[tier],
    used_today: db.usedToday,
    resets_at: endOfTodayUtc(),
    expires_at: null,
  };
}

export function endOfTodayUtc(): string {
  const now = new Date();
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0)
  );
  return end.toISOString();
}

export const PRICES: PriceListItem[] = [
  { symbol: 'BTCUSDT', name: 'Bitcoin', price: 64980.42, change_24h_percent: 2.34 },
  { symbol: 'ETHUSDT', name: 'Ethereum', price: 3512.18, change_24h_percent: -1.12 },
  { symbol: 'SOLUSDT', name: 'Solana', price: 168.74, change_24h_percent: 5.81 },
  { symbol: 'BNBUSDT', name: 'BNB', price: 598.3, change_24h_percent: 0.42 },
  { symbol: 'XRPUSDT', name: 'XRP', price: 0.5234, change_24h_percent: -2.05 },
  { symbol: 'ADAUSDT', name: 'Cardano', price: 0.4471, change_24h_percent: 1.27 },
];

/** Deterministic pseudo-random walk so a symbol's chart looks stable per range. */
export function priceSeries(symbol: string, count: number, base: number): { t: number; price: number }[] {
  let seed = [...symbol].reduce((a, c) => a + c.charCodeAt(0), 0);
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const points: { t: number; price: number }[] = [];
  let price = base;
  const now = Date.now();
  const step = 60_000;
  for (let i = count - 1; i >= 0; i--) {
    price = Math.max(0.0001, price * (1 + (rand() - 0.5) * 0.02));
    points.push({ t: now - i * step, price: Number(price.toFixed(4)) });
  }
  return points;
}

export const LESSONS: Lesson[] = [
  {
    id: 'les_01',
    title: 'Reading Support & Resistance',
    summary: 'Identify the price levels where trends pause or reverse.',
    image_url: 'https://picsum.photos/seed/lesson1/600/400',
    duration_minutes: 8,
    body: '# Support & Resistance\n\nSupport is a price level where buying pressure tends to overcome selling pressure...',
    video_url: 'https://example.com/videos/support-resistance.mp4',
  },
  {
    id: 'les_02',
    title: 'Risk Management 101',
    summary: 'Position sizing, stop losses, and protecting your capital.',
    image_url: 'https://picsum.photos/seed/lesson2/600/400',
    duration_minutes: 12,
    body: '# Risk Management\n\nNever risk more than 1-2% of your account on a single trade...',
  },
  {
    id: 'les_03',
    title: 'Understanding RSI Divergence',
    summary: 'Spot momentum shifts before the price confirms them.',
    image_url: 'https://picsum.photos/seed/lesson3/600/400',
    duration_minutes: 10,
    body: '# RSI Divergence\n\nDivergence occurs when price and the RSI move in opposite directions...',
  },
];
