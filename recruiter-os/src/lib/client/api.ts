'use client';

/** Thin fetch wrapper: same-origin JSON, uniform error shape, typed result. */
export class ApiRequestError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });

  if (response.status === 204) return undefined as T;

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text };
    }
  }

  if (!response.ok) {
    const data = payload as { error?: string; details?: unknown } | null;
    throw new ApiRequestError(response.status, data?.error ?? 'שגיאה בלתי צפויה', data?.details);
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  del: <T>(path: string) => request<T>('DELETE', path),

  /** Multipart upload (CV files) — Content-Type is set by the browser. */
  async upload<T>(path: string, formData: FormData): Promise<T> {
    const response = await fetch(path, { method: 'POST', body: formData, credentials: 'same-origin' });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new ApiRequestError(response.status, payload?.error ?? 'העלאה נכשלה', payload?.details);
    }
    return payload as T;
  },
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.details && Array.isArray(error.details)) {
      const first = error.details[0] as { message?: string } | undefined;
      if (first?.message) return `${error.message}: ${first.message}`;
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'שגיאה בלתי צפויה';
}
