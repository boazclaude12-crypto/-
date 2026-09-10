'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAppState } from './app-state';
import { Shell } from './shell';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { API_URL } from '@/lib/api';

const PUBLIC_ROUTES = ['/login', '/register'];

/** Keeps every screen behind a session, and says something useful when the API is down. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, reachable } = useAppState();
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_ROUTES.includes(pathname);

  useEffect(() => {
    if (!loading && !user && !isPublic) router.replace('/login');
  }, [loading, user, isPublic, router]);

  if (!reachable) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <ErrorState
          message={`The API at ${API_URL} is not responding. Start it with "npm run dev --workspace @ycf/server", or set NEXT_PUBLIC_API_URL to point at it.`}
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  if (loading) return <LoadingState label="Checking your session…" />;
  if (isPublic) return <>{children}</>;
  if (!user) return <LoadingState label="Redirecting to sign in…" />;

  return <Shell>{children}</Shell>;
}
