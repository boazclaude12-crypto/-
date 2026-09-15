import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth/server';
import { AuthForm } from '@/components/app/AuthForm';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'הרשמה — Recruiter OS' };

export default async function RegisterPage() {
  if (await getAuth()) redirect('/dashboard');
  return <AuthForm mode="register" />;
}
