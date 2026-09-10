import type { Metadata } from 'next';
import './globals.css';
import { AppStateProvider } from '@/components/app-state';
import { AuthGate } from '@/components/auth-gate';

export const metadata: Metadata = {
  title: 'YouTube Content Factory',
  description: 'Research, script, generate, render, publish and learn — one channel pipeline.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AppStateProvider>
          <AuthGate>{children}</AuthGate>
        </AppStateProvider>
      </body>
    </html>
  );
}
