import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, setAuthToken, type User } from '@/api';
import { tokenStorage } from './storage';

interface AuthState {
  user: User | null;
  /** True while restoring the persisted session on launch. */
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  // Restore a persisted token on startup and validate it via /auth/me.
  useEffect(() => {
    (async () => {
      const token = await tokenStorage.get();
      if (token) {
        setAuthToken(token);
        try {
          setUser(await api.auth.me());
        } catch {
          await tokenStorage.clear();
          setAuthToken(null);
        }
      }
      setInitializing(false);
    })();
  }, []);

  async function persistSession(token: string, nextUser: User) {
    setAuthToken(token);
    await tokenStorage.set(token);
    setUser(nextUser);
  }

  const value = useMemo<AuthState>(
    () => ({
      user,
      initializing,
      async signIn(email, password) {
        const { token, user: u } = await api.auth.login(email, password);
        await persistSession(token, u);
      },
      async signUp(email, password) {
        const { token, user: u } = await api.auth.register(email, password);
        await persistSession(token, u);
      },
      async signOut() {
        setUser(null);
        setAuthToken(null);
        await tokenStorage.clear();
      },
    }),
    [user, initializing]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
