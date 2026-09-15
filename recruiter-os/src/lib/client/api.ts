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

/**
 * How long to wait before calling a request stuck.
 *
 * Most calls here are a local database query and should return in milliseconds, so thirty
 * seconds is already far past "slow". But some operations are genuinely long by nature —
 * reading a mailbox, parsing forty CVs, sending mail through a provider — and holding
 * them to the same ceiling kills real work partway through and blames the server for it.
 * Those endpoints are listed here with the budget their work actually needs.
 */
const DEFAULT_TIMEOUT_MS = 30_000;

const LONG_RUNNING: Array<{ match: RegExp; ms: number; what: string }> = [
  { match: /^\/api\/email\/sync/, ms: 300_000, what: 'משיכת המייל' },
  { match: /^\/api\/email\/account/, ms: 90_000, what: 'החיבור לתיבה' },
  { match: /^\/api\/email\/digest/, ms: 120_000, what: 'שליחת הסיכום' },
  { match: /^\/api\/cv\/bulk/, ms: 300_000, what: 'קריאת הקבצים' },
  { match: /^\/api\/cv\/parse/, ms: 120_000, what: 'קריאת קורות החיים' },
  { match: /^\/api\/candidates\/import/, ms: 300_000, what: 'הייבוא' },
  { match: /^\/api\/jobs\/parse/, ms: 60_000, what: 'קריאת המשרה' },
  { match: /^\/api\/demo\/seed/, ms: 120_000, what: 'טעינת נתוני הדמו' },
  { match: /^\/api\/account\/reset/, ms: 120_000, what: 'המחיקה' },
  { match: /^\/api\/export/, ms: 120_000, what: 'הגיבוי' },
  { match: /^\/api\/messages\/generate/, ms: 60_000, what: 'ניסוח ההודעה' },
];

function budgetFor(path: string): { ms: number; what: string | null } {
  const hit = LONG_RUNNING.find((entry) => entry.match.test(path));
  return hit ? { ms: hit.ms, what: hit.what } : { ms: DEFAULT_TIMEOUT_MS, what: null };
}

/** Says what timed out and how long it was given, rather than blaming the server. */
function timeoutError(path: string): ApiRequestError {
  const { ms, what } = budgetFor(path);
  const minutes = Math.round(ms / 60_000);
  return new ApiRequestError(
    0,
    what
      ? `${what} לא הסתיים${minutes >= 2 ? ` תוך ${minutes} דקות` : ' בזמן'}. אפשר לנסות שוב — פעולה גדולה לוקחת זמן, וכדאי לחלק אותה למנות קטנות יותר.`
      : 'השרת לא הגיב בתוך 30 שניות. נסה שוב — ואם זה חוזר, זו תקלה בשרת.',
  );
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal: AbortSignal.timeout(budgetFor(path).ms),
    });
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === 'TimeoutError') throw timeoutError(path);
    throw new ApiRequestError(0, 'אין חיבור לשרת. בדוק את החיבור לאינטרנט ונסה שוב.');
  }

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
    let response: Response;
    try {
      response = await fetch(path, {
        method: 'POST',
        body: formData,
        credentials: 'same-origin',
        signal: AbortSignal.timeout(budgetFor(path).ms),
      });
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'TimeoutError') throw timeoutError(path);
      throw new ApiRequestError(0, 'אין חיבור לשרת. בדוק את החיבור לאינטרנט ונסה שוב.');
    }
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
