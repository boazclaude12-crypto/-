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

/**
 * An abort signal that fires after `ms`.
 *
 * `AbortSignal.timeout` only exists from Safari 16 / Chrome 103 onwards. On an older
 * phone it is simply undefined, and calling it throws a TypeError *before* fetch is
 * ever reached — every request in the app then fails instantly, which looks exactly
 * like a dead server. The controller fallback works everywhere, so no browser is left
 * without a timeout and none is broken by having one.
 */
function timeoutSignal(ms: number): { signal: AbortSignal; done: () => void; timedOut: () => boolean } {
  const native = (AbortSignal as { timeout?: (ms: number) => AbortSignal }).timeout;
  if (typeof native === 'function') {
    const signal = native.call(AbortSignal, ms);
    return { signal, done: () => {}, timedOut: () => signal.aborted };
  }
  const controller = new AbortController();
  let fired = false;
  const timer = setTimeout(() => {
    fired = true;
    controller.abort();
  }, ms);
  return { signal: controller.signal, done: () => clearTimeout(timer), timedOut: () => fired };
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

/**
 * Turns a thrown fetch into something the user can act on.
 *
 * A timeout, a cancelled request and a dead connection are three different things, and
 * calling them all "no internet" sends someone to restart a router over a bug. Anything
 * that is not a network failure is reported as itself, so it can be seen and fixed.
 */
function failureFor(path: string, caught: unknown, timedOut: boolean): ApiRequestError {
  if (timedOut) return timeoutError(path);
  const name = caught instanceof Error ? caught.name : '';
  if (name === 'TimeoutError') return timeoutError(path);
  if (name === 'AbortError') return new ApiRequestError(0, 'הפעולה בוטלה.');
  if (caught instanceof TypeError) {
    return new ApiRequestError(0, 'אין חיבור לשרת. בדוק את החיבור לאינטרנט ונסה שוב.');
  }
  const detail = caught instanceof Error ? caught.message : String(caught);
  return new ApiRequestError(0, `הבקשה נכשלה בדפדפן: ${detail}`);
}

/** Response bodies are usually JSON, but an error page is HTML — keep both readable. */
function readPayload(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 300) };
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const clock = timeoutSignal(budgetFor(path).ms);
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal: clock.signal,
    });
  } catch (caught) {
    throw failureFor(path, caught, clock.timedOut());
  } finally {
    clock.done();
  }

  if (response.status === 204) return undefined as T;

  const payload = readPayload(await response.text());

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
    const clock = timeoutSignal(budgetFor(path).ms);
    let response: Response;
    try {
      response = await fetch(path, {
        method: 'POST',
        body: formData,
        credentials: 'same-origin',
        signal: clock.signal,
      });
    } catch (caught) {
      throw failureFor(path, caught, clock.timedOut());
    } finally {
      clock.done();
    }
    // A failing host answers with an HTML error page, not JSON; parsing it raw would
    // surface "Unexpected token '<'" instead of what actually went wrong.
    const payload = readPayload(await response.text()) as { error?: string; details?: unknown } | null;
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
