import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { config } from '@/config';
import { api, setAuthToken, type User } from '@/api';
import { tokenStorage } from './storage';
import { supabase } from '@/lib/supabase';

interface AuthState {
  user: User | null;
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    if (config.useMock) {
      // Mock mode: restore token from secure storage and validate
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
      return;
    }

    // Real mode: restore Supabase session (handles token refresh automatically)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setAuthToken(session.access_token);
        const u = session.user;
        setUser({ id: u.id, email: u.email ?? '', created_at: u.created_at });
      }
      setInitializing(false);
    });

    // Keep the in-memory token in sync with Supabase's automatic refreshes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        setAuthToken(session.access_token);
        const u = session.user;
        setUser({ id: u.id, email: u.email ?? '', created_at: u.created_at });
      } else {
        setAuthToken(null);
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      initializing,

      async signIn(email, password) {
        if (config.useMock) {
          const { token, user: u } = await api.auth.login(email, password);
          setAuthToken(token);
          await tokenStorage.set(token);
          setUser(u);
          return;
        }
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message);
        setAuthToken(data.session.access_token);
        const u = data.user;
        setUser({ id: u.id, email: u.email ?? '', created_at: u.created_at });
      },

      async signUp(email, password) {
        if (config.useMock) {
          const { token, user: u } = await api.auth.register(email, password);
          setAuthToken(token);
          await tokenStorage.set(token);
          setUser(u);
          return;
        }
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw new Error(error.message);
        if (!data.session) throw new Error('Please confirm your email before signing in.');
        setAuthToken(data.session.access_token);
        const u = data.user!;
        setUser({ id: u.id, email: u.email ?? '', created_at: u.created_at });
      },

      async signOut() {
        if (!config.useMock) await supabase.auth.signOut();
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
