/**
 * Shared API types, mirroring the REST spec the Next.js backend will expose.
 * These are the contract between the mobile client and the server; the mock
 * layer produces values that conform to exactly these shapes.
 */

// ---- Errors ---------------------------------------------------------------

/** Unified error envelope returned by every endpoint on failure. */
export interface ApiErrorBody {
  error: string;
  message: string;
  /** Present on 429 (limit_reached) — ISO timestamp of the daily reset. */
  resets_at?: string;
}

// ---- Auth -----------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

// ---- Subscription ---------------------------------------------------------

export type SubscriptionTier = 'free' | 'pro' | 'premium';

export type SubscriptionSource = 'web' | 'ios_iap' | 'android_iap' | 'none';

export interface SubscriptionStatus {
  tier: SubscriptionTier;
  active: boolean;
  /** Source of the subscription. "web" = paid on the website (no IAP needed). */
  source: SubscriptionSource;
  /** Daily analysis quota for the tier (5 / 10 / 25). */
  daily_limit: number;
  /** How many analyses were used today. */
  used_today: number;
  /** ISO timestamp when used_today resets to 0. */
  resets_at: string;
  /** ISO timestamp the subscription expires, or null for non-expiring/web. */
  expires_at: string | null;
}

export interface SubscriptionPlan {
  id: string;
  tier: SubscriptionTier;
  name: string;
  price: number;
  currency: string;
  period: 'month' | 'year';
  daily_limit: number;
  features: string[];
  /** Store product identifiers used for IAP. */
  apple_product_id?: string;
  google_product_id?: string;
}

export interface VerifyIapRequest {
  platform: 'ios' | 'android';
  receipt: string;
  product_id: string;
}

// ---- Analysis -------------------------------------------------------------

export type TradeDirection = 'long' | 'short';

export interface Analysis {
  id: string;
  created_at: string;
  /** URL/URI of the uploaded chart image. */
  image_url: string;
  symbol: string | null;
  direction: TradeDirection;
  entry_point: number;
  take_profit: number;
  stop_loss: number;
  /** 0..1 model confidence. */
  confidence: number;
  explanation: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  has_more: boolean;
}

// ---- Prices ---------------------------------------------------------------

export interface PriceListItem {
  symbol: string;
  name: string;
  price: number;
  change_24h_percent: number;
  market_cap?: number;
  icon_url?: string;
}

export type PriceRange = '1h' | '24h' | '7d' | '30d';

export interface PricePoint {
  /** Unix epoch milliseconds. */
  t: number;
  price: number;
}

export interface PriceHistory {
  symbol: string;
  range: PriceRange;
  points: PricePoint[];
}

// ---- Alerts ---------------------------------------------------------------

export type AlertDirection = 'up' | 'down';

export interface PriceAlert {
  id: string;
  symbol: string;
  direction: AlertDirection;
  threshold_percent: number;
  timeframe: PriceRange;
  active: boolean;
  created_at: string;
}

export interface CreateAlertRequest {
  symbol: string;
  direction: AlertDirection;
  threshold_percent: number;
  timeframe: PriceRange;
}

export interface PushTokenRequest {
  token: string;
  provider: 'expo' | 'fcm' | 'apns';
  device_id?: string;
}

// ---- Lessons --------------------------------------------------------------

export interface LessonSummary {
  id: string;
  title: string;
  summary: string;
  image_url: string;
  duration_minutes?: number;
}

export interface Lesson extends LessonSummary {
  /** Markdown / HTML body. */
  body: string;
  video_url?: string;
}
