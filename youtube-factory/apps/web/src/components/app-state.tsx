'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, api, type ChannelSummary, type User } from '@/lib/api';

interface AppState {
  user: User | null;
  channels: ChannelSummary[];
  channelId: string | null;
  setChannelId: (id: string) => void;
  loading: boolean;
  reachable: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const Context = createContext<AppState | null>(null);
const STORAGE_KEY = 'ycf.channelId';

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [channelId, setChannelIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reachable, setReachable] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api.get<{ user: User; channels: ChannelSummary[] }>('/api/auth/me');
      setUser(me.user);
      setChannels(me.channels);
      setReachable(true);

      setChannelIdState((current) => {
        if (current && me.channels.some((c) => c.id === current)) return current;
        const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
        if (stored && me.channels.some((c) => c.id === stored)) return stored;
        return me.channels.find((c) => c.isDefault)?.id ?? me.channels[0]?.id ?? null;
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'network_error') setReachable(false);
      setUser(null);
      setChannels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setChannelId = useCallback((id: string) => {
    setChannelIdState(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* private browsing — the selection just does not persist */
    }
  }, []);

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout').catch(() => undefined);
    setUser(null);
    setChannels([]);
    router.push('/login');
  }, [router]);

  const value = useMemo(
    () => ({ user, channels, channelId, setChannelId, loading, reachable, refresh, logout }),
    [user, channels, channelId, setChannelId, loading, reachable, refresh, logout],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAppState(): AppState {
  const state = useContext(Context);
  if (!state) throw new Error('useAppState must be used inside AppStateProvider');
  return state;
}
