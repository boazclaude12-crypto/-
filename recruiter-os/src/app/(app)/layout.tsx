import { requireAuth } from '@/lib/auth/server';
import { AppShell } from '@/components/app/AppShell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAuth();
  return (
    <AppShell user={{ name: auth.user.name, email: auth.user.email, orgName: auth.org.name }}>
      {children}
    </AppShell>
  );
}
