const env = process.env;

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  return value === 'true' || value === '1';
}

export const config = {
  /** Base URL of the deployed Next.js backend (no trailing slash). */
  apiBaseUrl: env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000',

  /** Public Supabase project URL. */
  supabaseUrl: env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://sidfexwzfecuvvoeoffp.supabase.co',

  /** Supabase anon (public) key. */
  supabaseAnonKey: env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpZGZleHd6ZmVjdXZ2b2VvZmZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkwOTI2MzUsImV4cCI6MjA1NDY2ODYzNX0.sN9Gug1LIxG6kTsmEcaL7b1jNKqIJ1dDrcz_bOPKqcs',

  /** Public website, opened in the browser to start a subscription / free trial. */
  webUrl: env.EXPO_PUBLIC_WEB_URL ?? 'https://app.cryptoai.example',

  /** When true, all API calls are served by the local mock layer. */
  useMock: bool(env.EXPO_PUBLIC_USE_MOCK, true),

  /** Simulated network latency (ms) for the mock layer. */
  mockLatencyMs: 450,
};
