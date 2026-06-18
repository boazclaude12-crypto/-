import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'cryptoai.auth.token';

/** Persisted auth token helpers, backed by the device secure store. */
export const tokenStorage = {
  async get(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  async set(token: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
    } catch {
      // SecureStore has no web implementation; the in-memory token still
      // works for the session, only persistence across restarts is lost.
    }
  },
  async clear(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch {
      // See set() above.
    }
  },
};
