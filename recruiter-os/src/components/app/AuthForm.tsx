'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, ErrorNote, Field, Input } from '../ui';
import { Icon } from '../ui/icons';
import { api, errorMessage } from '@/lib/client/api';

const BENEFITS = [
  'כל המועמדים, המשרות והלקוחות במקום אחד',
  'התאמה אוטומטית של מועמדים למשרות עם הסבר לכל ציון',
  'המערכת אומרת לך מה הפעולה החשובה הבאה',
  'מעקב מלא אחרי עמלות, גבייה והכנסות',
];

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const isRegister = mode === 'register';
  const [name, setName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isRegister) {
        await api.post('/api/auth/register', { name, email, password, orgName: orgName || null });
      } else {
        await api.post('/api/auth/login', { email, password });
      }
      router.push('/dashboard');
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-brand-ink">
              <Icon.Target size={22} />
            </span>
            <div>
              <p className="text-base font-semibold text-ink">Recruiter OS</p>
              <p className="text-xs text-faint">מערכת הגיוס לפרילנסרים</p>
            </div>
          </div>

          <h1 className="text-2xl font-semibold text-ink">
            {isRegister ? 'פתיחת חשבון' : 'ברוך שובך'}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {isRegister
              ? 'דקה אחת, ואתה בפנים. אין צורך בכרטיס אשראי.'
              : 'התחבר כדי להמשיך לנהל את הגיוס שלך.'}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <ErrorNote>{error}</ErrorNote>

            {isRegister && (
              <>
                <Field label="שם מלא" required>
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    required
                    autoFocus
                  />
                </Field>
                <Field label="שם העסק" hint="לא חובה — אפשר לשנות בהמשך">
                  <Input
                    value={orgName}
                    onChange={(event) => setOrgName(event.target.value)}
                    placeholder="הגיוס של דנה"
                  />
                </Field>
              </>
            )}

            <Field label="אימייל" required>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                autoFocus={!isRegister}
                dir="ltr"
              />
            </Field>

            <Field
              label="סיסמה"
              required
              hint={isRegister ? 'לפחות 8 תווים, עם אות וספרה' : undefined}
            >
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                required
                dir="ltr"
              />
            </Field>

            <Button type="submit" loading={busy} className="w-full" size="lg">
              {isRegister ? 'יצירת חשבון' : 'כניסה'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            {isRegister ? 'כבר יש לך חשבון? ' : 'עוד אין לך חשבון? '}
            <Link href={isRegister ? '/login' : '/register'} className="font-medium text-brand">
              {isRegister ? 'התחברות' : 'הרשמה'}
            </Link>
          </p>
        </div>
      </div>

      <div className="hidden items-center justify-center bg-brand-soft px-10 lg:flex">
        <div className="max-w-md">
          <h2 className="text-xl font-semibold text-ink">
            במקום אקסל, וואטסאפ ופתקים — מערכת אחת שיודעת מה קורה.
          </h2>
          <ul className="mt-6 space-y-3">
            {BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2.5 text-sm text-muted">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-brand-ink">
                  <Icon.Check size={12} />
                </span>
                {benefit}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
