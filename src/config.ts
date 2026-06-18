/**
 * App-wide configuration.
 *
 * While the backend (Next.js) API does not exist yet, the app runs against the
 * built-in mock layer. Flip USE_MOCK to false (or set EXPO_PUBLIC_USE_MOCK=false)
 * once the real endpoints are available, and point API_BASE_URL at the server.
 */

const env = process.env;

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  return value === 'true' || value === '1';
}

export const config = {
  /** Base URL of the Next.js API. Used only when USE_MOCK is false. */
  apiBaseUrl: env.EXPO_PUBLIC_API_BASE_URL ?? 'https://app.cryptoai.example/api',

  /** Public website, opened in the browser to start a subscription / free trial. */
  webUrl: env.EXPO_PUBLIC_WEB_URL ?? 'https://app.cryptoai.example',

  /** When true, all API calls are served by the local mock layer. */
  useMock: bool(env.EXPO_PUBLIC_USE_MOCK, true),

  /** Simulated network latency (ms) for the mock layer, to mimic real loading. */
  mockLatencyMs: 450,
};
