import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export default async function RootPage() {
  const auth = await getAuth();
  redirect(auth ? '/dashboard' : '/login');
}
