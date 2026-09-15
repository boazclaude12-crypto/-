import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { z, ZodError, type ZodTypeAny, type infer as ZodInfer } from 'zod';
import { resolveSession, SESSION_COOKIE, touchSession, type AuthContext } from './auth/session';
import { checkRateLimit } from './rate-limit';
import { ApiError, badRequest, unauthorized } from './errors';

export { ApiError, badRequest, unauthorized, forbidden, notFound } from './errors';

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

/** Uniform error shape for the client: { error: string, details?: unknown }. */
export function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
  }
  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
    return NextResponse.json({ error: 'הנתונים שנשלחו אינם תקינים', details }, { status: 422 });
  }
  console.error('[api] unhandled error', error);
  return NextResponse.json({ error: 'שגיאת שרת. נסה שוב.' }, { status: 500 });
}

/** Generic over the schema so the *output* type (post-transform) is what callers get. */
export async function parseBody<S extends ZodTypeAny>(request: Request, schema: S): Promise<ZodInfer<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw badRequest('גוף הבקשה אינו JSON תקין');
  }
  return schema.parse(raw);
}

export function parseQuery<S extends ZodTypeAny>(request: Request, schema: S): ZodInfer<S> {
  const url = new URL(request.url);
  const entries: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    entries[key] = values.length > 1 ? values : values[0]!;
  }
  return schema.parse(entries);
}

async function authFromCookies(): Promise<AuthContext> {
  const store = await cookies();
  const auth = resolveSession(store.get(SESSION_COOKIE)?.value);
  if (!auth) throw unauthorized();
  return auth;
}

export interface RouteContext<P = Record<string, string>> {
  auth: AuthContext;
  params: P;
}

type Handler<P> = (request: Request, context: RouteContext<P>) => Promise<Response> | Response;

/**
 * Wraps a route handler with authentication, per-user rate limiting and error
 * translation. Every authenticated endpoint goes through this, so no handler can
 * accidentally run without a scoped org id.
 */
export function withAuth<P = Record<string, string>>(
  handler: Handler<P>,
  options: { limit?: number; windowMs?: number } = {},
) {
  return async (request: Request, ctx: { params: Promise<P> }): Promise<Response> => {
    try {
      const auth = await authFromCookies();
      const limit = options.limit ?? 300;
      const windowMs = options.windowMs ?? 60_000;
      const result = checkRateLimit(`api:${auth.user.id}`, limit, windowMs);
      if (!result.allowed) {
        return NextResponse.json(
          { error: 'יותר מדי בקשות. המתן רגע ונסה שוב.' },
          { status: 429, headers: { 'Retry-After': String(result.retryAfterSeconds) } },
        );
      }
      touchSession(auth.sessionId);
      const params = (ctx?.params ? await ctx.params : {}) as P;
      return await handler(request, { auth, params });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** Same wrapper for endpoints that must stay public (login, register). */
export function withPublic(handler: (request: Request) => Promise<Response> | Response) {
  return async (request: Request): Promise<Response> => {
    try {
      return await handler(request);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export async function clientIp(): Promise<string> {
  const list = await headers();
  const forwarded = list.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0]!.trim() : list.get('x-real-ip') ?? 'local';
}

/** Common query-string coercions shared by list endpoints. */
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
