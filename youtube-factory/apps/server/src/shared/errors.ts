/** Base class for every error the application raises on purpose. */
export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: unknown;
  readonly retryable: boolean;

  constructor(
    code: string,
    message: string,
    opts: { statusCode?: number; details?: unknown; retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message, opts.cause ? { cause: opts.cause } : undefined);
    this.name = new.target.name;
    this.code = code;
    this.statusCode = opts.statusCode ?? 500;
    this.details = opts.details;
    this.retryable = opts.retryable ?? false;
  }

  toJSON() {
    return { code: this.code, message: this.message, details: this.details };
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super('validation_error', message, { statusCode: 400, details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super('unauthorized', message, { statusCode: 401 });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Not allowed') {
    super('forbidden', message, { statusCode: 403 });
  }
}

export class NotFoundError extends AppError {
  constructor(what: string) {
    super('not_found', `${what} not found`, { statusCode: 404 });
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super('conflict', message, { statusCode: 409, details });
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests', retryAfterSec?: number) {
    super('rate_limited', message, { statusCode: 429, details: { retryAfterSec }, retryable: true });
  }
}

/** A provider is wired up but has no credentials — it must never be selected. */
export class ProviderNotConfiguredError extends AppError {
  constructor(providerKey: string, missing: string[]) {
    super('provider_not_configured', `Provider "${providerKey}" is not configured`, {
      statusCode: 503,
      details: { providerKey, missingEnv: missing },
    });
  }
}

/** An upstream vendor returned an error. `retryable` drives the retry/fallback policy. */
export class ProviderError extends AppError {
  readonly providerKey: string;
  constructor(
    providerKey: string,
    message: string,
    opts: { status?: number; retryable?: boolean; details?: unknown; cause?: unknown } = {},
  ) {
    super('provider_error', message, {
      statusCode: 502,
      details: { providerKey, status: opts.status, ...(opts.details as object | undefined) },
      retryable: opts.retryable ?? isRetryableStatus(opts.status),
      cause: opts.cause,
    });
    this.providerKey = providerKey;
  }
}

export class BudgetExceededError extends AppError {
  constructor(message: string, details: unknown) {
    super('budget_exceeded', message, { statusCode: 402, details });
  }
}

export class PipelineError extends AppError {
  constructor(message: string, details?: unknown, retryable = true) {
    super('pipeline_error', message, { statusCode: 500, details, retryable });
  }
}

export function isRetryableStatus(status?: number): boolean {
  if (status === undefined) return true; // network-level failure
  if (status === 408 || status === 409 || status === 425 || status === 429) return true;
  return status >= 500;
}

export function isRetryable(err: unknown): boolean {
  if (err instanceof AppError) return err.retryable;
  // Undici / Node network errors are worth another attempt.
  const code = (err as { code?: string } | undefined)?.code;
  return (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'EAI_AGAIN' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'UND_ERR_SOCKET'
  );
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
