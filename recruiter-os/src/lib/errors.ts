/**
 * Framework-free error types.
 *
 * Kept out of `http.ts` (which imports next/server) so the domain layer can throw
 * typed errors and still run outside the web server — in CLI scripts and tests.
 */
export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) => new ApiError(400, message, details);
export const unauthorized = (message = 'נדרשת התחברות') => new ApiError(401, message);
export const forbidden = (message = 'אין הרשאה') => new ApiError(403, message);
export const notFound = (message = 'לא נמצא') => new ApiError(404, message);
