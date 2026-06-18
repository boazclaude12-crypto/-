import type { ApiErrorBody } from './types';

/** Error thrown by the client for any non-2xx response, in the unified format. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly resetsAt?: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message || body.error);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.error;
    this.resetsAt = body.resets_at;
  }
}
