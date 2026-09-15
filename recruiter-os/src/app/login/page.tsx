import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth/server';
import { AuthForm } from '@/components/app/AuthForm';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'התחברות — Recruiter OS' };

export default async function LoginPage() {
  if (await getAuth()) redirect('/dashboard');
  return (
    <>
      <AuthForm mode="login" />
      {/* The one page someone reaches when they cannot get in, so it is where the
          "is it me or is it the server?" answer has to be reachable from. A plain
          anchor, not a Link: it has to work when the client bundle is the problem. */}
      <p style={{ textAlign: 'center', margin: '18px 0 32px', fontSize: 13 }}>
        <a href="/status" style={{ color: '#64748b' }}>
          לא נטען? בדוק את מצב המערכת
        </a>
      </p>
    </>
  );
}
