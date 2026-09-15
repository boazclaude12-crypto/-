'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { cx } from './index';

type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE_STYLES: Record<ToastTone, string> = {
  success: 'border-ok/40 bg-ok/10 text-ok',
  error: 'border-danger/40 bg-danger/10 text-danger',
  info: 'border-brand/40 bg-brand-soft text-brand',
};

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((tone: ToastTone, message: string) => {
    const id = nextId++;
    setItems((current) => [...current, { id, tone, message }]);
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 4200);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message),
      info: (message) => push('info', message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={cx(
              'pointer-events-auto animate-fade-in rounded-lg border px-4 py-2.5 text-sm font-medium shadow-pop backdrop-blur',
              TONE_STYLES[item.tone],
            )}
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Falls back to a no-op outside the provider so components stay testable. */
export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  return (
    context ?? {
      success: () => undefined,
      error: () => undefined,
      info: () => undefined,
    }
  );
}
