import { ProviderError } from '../shared/errors.js';

export interface HttpOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: unknown;
  /** Raw body (already-encoded bytes) — used for resumable uploads. */
  rawBody?: Buffer | Uint8Array | string;
  timeoutMs?: number;
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | undefined>;
}

export interface HttpResponse<T> {
  status: number;
  headers: Headers;
  data: T;
}

/**
 * Shared HTTP client for every vendor adapter. Adds a timeout, normalises vendor errors
 * into `ProviderError` (which carries the retryable flag the router needs), and never
 * logs request headers.
 */
export async function request<T = unknown>(
  providerKey: string,
  url: string,
  opts: HttpOptions = {},
): Promise<HttpResponse<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 120_000);
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const target = new URL(url);
  for (const [key, value] of Object.entries(opts.query ?? {})) {
    if (value !== undefined) target.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = { ...opts.headers };
  let body: string | Buffer | Uint8Array | undefined;
  if (opts.rawBody !== undefined) {
    body = opts.rawBody;
  } else if (opts.body !== undefined) {
    headers['content-type'] = headers['content-type'] ?? 'application/json';
    body = JSON.stringify(opts.body);
  }

  let response: Response;
  try {
    response = await fetch(target, {
      method: opts.method ?? (body ? 'POST' : 'GET'),
      headers,
      body: body as never,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    const aborted = (err as Error).name === 'AbortError';
    throw new ProviderError(providerKey, aborted ? 'Request timed out' : `Network error: ${(err as Error).message}`, {
      retryable: true,
      cause: err,
    });
  } finally {
    clearTimeout(timeout);
  }

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('json');
  const payload = isJson ? await response.json().catch(() => ({})) : await response.text();

  if (!response.ok) {
    throw new ProviderError(providerKey, describeError(payload, response.status), {
      status: response.status,
      details: { body: truncateBody(payload) },
    });
  }

  return { status: response.status, headers: response.headers, data: payload as T };
}

/** Binary GET — image/video/audio downloads from provider result URLs. */
export async function download(
  providerKey: string,
  url: string,
  opts: { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<{ bytes: Buffer; mimeType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 300_000);
  try {
    const res = await fetch(url, { headers: opts.headers, signal: controller.signal });
    if (!res.ok) {
      throw new ProviderError(providerKey, `Download failed with HTTP ${res.status}`, { status: res.status });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { bytes: buf, mimeType: res.headers.get('content-type') ?? 'application/octet-stream' };
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    throw new ProviderError(providerKey, `Download failed: ${(err as Error).message}`, {
      retryable: true,
      cause: err,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function describeError(payload: unknown, status: number): string {
  if (typeof payload === 'string') return payload.slice(0, 400) || `HTTP ${status}`;
  const p = payload as {
    error?: { message?: string; type?: string } | string;
    detail?: unknown;
    message?: string;
  };
  if (typeof p?.error === 'string') return p.error;
  if (p?.error?.message) return p.error.message;
  if (p?.message) return String(p.message);
  if (p?.detail) return typeof p.detail === 'string' ? p.detail : JSON.stringify(p.detail).slice(0, 400);
  return `HTTP ${status}`;
}

function truncateBody(payload: unknown): unknown {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return text.length > 1000 ? `${text.slice(0, 1000)}…` : payload;
}

/** Poll an async job endpoint until it reaches a terminal state. */
export async function pollUntil<T>(
  fn: () => Promise<T>,
  isDone: (value: T) => boolean,
  opts: { intervalMs: number; timeoutMs: number; sleep: (ms: number) => Promise<void>; onTick?: (v: T) => void },
): Promise<T> {
  const deadline = Date.now() + opts.timeoutMs;
  for (;;) {
    const value = await fn();
    opts.onTick?.(value);
    if (isDone(value)) return value;
    if (Date.now() >= deadline) {
      throw new ProviderError('poll', 'Timed out waiting for the generation job to finish', { retryable: true });
    }
    await opts.sleep(opts.intervalMs);
  }
}
