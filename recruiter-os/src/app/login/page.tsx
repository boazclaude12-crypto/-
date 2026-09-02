import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth/server';
import { AuthForm } from '@/components/app/AuthForm';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'התחברות — Recruiter OS' };

export default async function LoginPage() {
  if (await getAuth()) redirect('/dashboard');
  return <AuthForm mode="login" />;
}
