import { config } from '@/config';
import type { ApiErrorBody } from './types';
import { ApiError } from './errors';
import { handleMock } from './mock';

export { ApiError };

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface RequestOptions {
  method?: HttpMethod;
  /** Query params appended to the path. */
  query?: Record<string, string | number | undefined>;
  /** JSON body. Ignored when `form` is provided. */
  body?: unknown;
  /** multipart/form-data body (e.g. image upload). */
  form?: FormData;
  /** Set false to skip the Authorization header (login/register). */
  auth?: boolean;
}

// In-memory auth token. AuthContext keeps this in sync with secure storage.
let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

function buildQuery(query?: RequestOptions['query']): string {
  if (!query) return '';
  const parts = Object.entries(query)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

/**
 * Single entry point for all API calls. Routes to the mock layer when
 * config.useMock is true; otherwise performs a real fetch. Always resolves
 * with the parsed JSON body, or throws ApiError on failure.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', query, body, form, auth = true } = options;

  if (config.useMock) {
    return handleMock<T>({ path, method, query, body, form, token: auth ? authToken : null });
  }

  const headers: Record<string, string> = {};
  if (auth && authToken) headers.Authorization = `Bearer ${authToken}`;

  let payload: BodyInit | undefined;
  if (form) {
    payload = form as unknown as BodyInit; // fetch sets the multipart boundary
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${config.apiBaseUrl}${path}${buildQuery(query)}`, {
    method,
    headers,
    body: payload,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const errBody: ApiErrorBody =
      data && typeof data === 'object' && 'error' in data
        ? data
        : { error: 'unknown_error', message: `Request failed (${res.status})` };
    throw new ApiError(res.status, errBody);
  }

  return data as T;
}
