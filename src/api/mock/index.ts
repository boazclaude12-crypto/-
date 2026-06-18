import { config } from '@/config';
import { ApiError } from '../errors';
import type {
  Analysis,
  AuthResponse,
  CreateAlertRequest,
  Paginated,
  PriceAlert,
  PriceHistory,
  PriceRange,
  SubscriptionStatus,
  User,
  VerifyIapRequest,
} from '../types';
import { LESSONS, PLANS, PRICES, currentSubscription, db, priceSeries, seed } from './data';

export interface MockRequest {
  path: string;
  method: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  form?: FormData;
  token: string | null;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fail(status: number, error: string, message: string, extra?: Record<string, unknown>): never {
  throw new ApiError(status, { error, message, ...extra });
}

/** Resolve the authenticated user from the bearer token, or throw 401. */
function requireUser(token: string | null): User {
  if (!token) fail(401, 'unauthorized', 'Missing authentication token.');
  const email = db.sessions.get(token!);
  const record = email ? db.users.get(email) : undefined;
  if (!record) fail(401, 'unauthorized', 'Invalid or expired token.');
  return record!.user;
}

/** Throw 403 when the active subscription does not gate the requested feature. */
function requireActiveSubscription(): SubscriptionStatus {
  const sub = currentSubscription();
  if (!sub.active) fail(403, 'subscription_required', 'An active subscription is required.');
  return sub;
}

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The mock router. Returns the same JSON shapes the real API will return, and
 * throws ApiError (matching the unified error format) for failure cases.
 */
export async function handleMock<T>(req: MockRequest): Promise<T> {
  seed();
  await delay(config.mockLatencyMs);

  const { path, method, token } = req;
  const body = (req.body ?? {}) as Record<string, any>;
  const route = `${method} ${stripId(path)}`;

  switch (route) {
    // ---- Auth -------------------------------------------------------------
    case 'POST /auth/register':
      return register(body) as T;
    case 'POST /auth/login':
      return login(body) as T;
    case 'GET /auth/me':
      return requireUser(token) as T;

    // ---- Subscription -----------------------------------------------------
    case 'GET /subscription/status':
      requireUser(token);
      return currentSubscription() as T;
    case 'GET /subscription/plans':
      requireUser(token);
      return PLANS as T;
    case 'POST /subscription/verify-iap':
      requireUser(token);
      return verifyIap(body as VerifyIapRequest) as T;

    // ---- Analysis ---------------------------------------------------------
    case 'POST /analyze':
      requireUser(token);
      return analyze(req.form) as T;
    case 'GET /analyses/history':
      requireUser(token);
      return historyPage(req.query) as T;
    case 'GET /analyses/:id': {
      requireUser(token);
      const found = db.analyses.find((a) => a.id === lastSegment(path));
      if (!found) fail(404, 'not_found', 'Analysis not found.');
      return found as T;
    }

    // ---- Prices (public-ish, still behind auth per spec) ------------------
    case 'GET /prices/list':
      requireUser(token);
      return PRICES as T;
    case 'GET /prices/:symbol':
      requireUser(token);
      return priceHistory(lastSegment(path), req.query) as T;

    // ---- Alerts -----------------------------------------------------------
    case 'GET /alerts':
      requireUser(token);
      return [...db.alerts] as T;
    case 'POST /alerts':
      requireUser(token);
      return createAlert(body as CreateAlertRequest) as T;
    case 'DELETE /alerts/:id': {
      requireUser(token);
      const id = lastSegment(path);
      const idx = db.alerts.findIndex((a) => a.id === id);
      if (idx === -1) fail(404, 'not_found', 'Alert not found.');
      db.alerts.splice(idx, 1);
      return { success: true } as T;
    }
    case 'POST /push-tokens':
      requireUser(token);
      if (body.token) db.pushTokens.push(body.token);
      return { success: true } as T;

    // ---- Lessons (subscription-gated) -------------------------------------
    case 'GET /lessons':
      requireUser(token);
      requireActiveSubscription();
      return LESSONS.map(({ body: _b, video_url: _v, ...summary }) => summary) as T;
    case 'GET /lessons/:id': {
      requireUser(token);
      requireActiveSubscription();
      const lesson = LESSONS.find((l) => l.id === lastSegment(path));
      if (!lesson) fail(404, 'not_found', 'Lesson not found.');
      return lesson as T;
    }

    default:
      return fail(404, 'not_found', `No mock handler for ${route}`) as T;
  }
}

// ---- Path helpers ---------------------------------------------------------

function lastSegment(path: string): string {
  const clean = path.split('?')[0].replace(/\/$/, '');
  return clean.slice(clean.lastIndexOf('/') + 1);
}

/** Normalize a concrete path to its route template (e.g. /alerts/al_1 -> /alerts/:id). */
function stripId(path: string): string {
  const p = path.split('?')[0].replace(/\/$/, '');
  if (/^\/analyses\/[^/]+$/.test(p) && p !== '/analyses/history') return '/analyses/:id';
  if (/^\/prices\/[^/]+$/.test(p) && p !== '/prices/list') return '/prices/:symbol';
  if (/^\/alerts\/[^/]+$/.test(p)) return '/alerts/:id';
  if (/^\/lessons\/[^/]+$/.test(p)) return '/lessons/:id';
  return p;
}

// ---- Handlers -------------------------------------------------------------

function register(body: Record<string, any>): AuthResponse {
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  if (!email || !password) fail(400, 'invalid_request', 'Email and password are required.');
  if (db.users.has(email)) fail(409, 'email_taken', 'An account with this email already exists.');

  const user: User = { id: newId('usr'), email, created_at: new Date().toISOString() };
  const token = newId('tok');
  db.users.set(email, { user, password, token });
  db.sessions.set(token, email);
  return { token, user };
}

function login(body: Record<string, any>): AuthResponse {
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const record = db.users.get(email);
  if (!record || record.password !== password) {
    fail(401, 'invalid_credentials', 'Incorrect email or password.');
  }
  return { token: record!.token, user: record!.user };
}

function verifyIap(req: VerifyIapRequest): SubscriptionStatus {
  if (!req?.receipt) fail(400, 'invalid_receipt', 'A store receipt is required.');
  // Mock: always accept and report an active subscription via IAP.
  const sub = currentSubscription();
  return { ...sub, source: req.platform === 'ios' ? 'ios_iap' : 'android_iap' };
}

function analyze(form?: FormData): Analysis {
  const sub = currentSubscription();
  if (sub.used_today >= sub.daily_limit) {
    fail(429, 'limit_reached', 'Daily analysis limit reached.', { resets_at: sub.resets_at });
  }
  db.usedToday += 1;

  // Pull a (mock) image reference from the multipart form if present.
  let imageUrl = `https://picsum.photos/seed/${Math.random().toString(36).slice(2, 7)}/800/450`;
  const file: any = form && typeof (form as any).get === 'function' ? (form as any).get('image') : null;
  if (file && typeof file === 'object' && 'uri' in file) imageUrl = file.uri;

  const direction = Math.random() > 0.5 ? 'long' : 'short';
  const entry = Number((60000 + Math.random() * 8000).toFixed(2));
  const analysis: Analysis = {
    id: newId('an'),
    created_at: new Date().toISOString(),
    image_url: imageUrl,
    symbol: null,
    direction,
    entry_point: entry,
    take_profit: Number((direction === 'long' ? entry * 1.05 : entry * 0.95).toFixed(2)),
    stop_loss: Number((direction === 'long' ? entry * 0.975 : entry * 1.025).toFixed(2)),
    confidence: Number((0.6 + Math.random() * 0.35).toFixed(2)),
    explanation:
      direction === 'long'
        ? 'Bullish market structure with a clean higher-low and reclaimed support. Targeting the next liquidity zone; invalidation below the recent swing low.'
        : 'Bearish rejection at range resistance with weakening momentum. Targeting the lower demand zone; invalidation above the recent swing high.',
  };
  db.analyses.unshift(analysis);
  return analysis;
}

function historyPage(query?: Record<string, string | number | undefined>): Paginated<Analysis> {
  const page = Math.max(1, Number(query?.page ?? 1));
  const pageSize = Math.max(1, Number(query?.page_size ?? 10));
  const start = (page - 1) * pageSize;
  const items = db.analyses.slice(start, start + pageSize);
  return {
    items,
    page,
    page_size: pageSize,
    total: db.analyses.length,
    has_more: start + pageSize < db.analyses.length,
  };
}

function priceHistory(symbol: string, query?: Record<string, string | number | undefined>): PriceHistory {
  const range = (String(query?.range ?? '24h') as PriceRange) || '24h';
  const counts: Record<PriceRange, number> = { '1h': 60, '24h': 96, '7d': 168, '30d': 120 };
  const base = PRICES.find((p) => p.symbol === symbol)?.price ?? 1000;
  return { symbol, range, points: priceSeries(symbol, counts[range] ?? 96, base) };
}

function createAlert(req: CreateAlertRequest): PriceAlert {
  if (!req?.symbol || !req?.direction) fail(400, 'invalid_request', 'symbol and direction are required.');
  const alert: PriceAlert = {
    id: newId('al'),
    symbol: req.symbol,
    direction: req.direction,
    threshold_percent: Number(req.threshold_percent) || 5,
    timeframe: req.timeframe ?? '24h',
    active: true,
    created_at: new Date().toISOString(),
  };
  db.alerts.unshift(alert);
  return alert;
}
