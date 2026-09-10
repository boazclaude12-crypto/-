'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlaySquare } from 'lucide-react';
import { api } from '@/lib/api';
import { useAppState } from '@/components/app-state';
import { useMutation, useQuery } from '@/hooks/use-api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';

export default function LoginPage() {
  const router = useRouter();
  const { user, refresh } = useAppState();
  const { data: meta } = useQuery<{ registrationOpen: boolean }>('/api/meta');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (user) router.replace('/');
  }, [user, router]);

  const submit = useMutation(async () => {
    const path = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
    await api.post(path, { email, password });
    await refresh();
    router.replace('/');
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center space-y-2 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <PlaySquare className="h-5 w-5 text-primary" aria-hidden />
          </div>
          <CardTitle className="text-base">YouTube Content Factory</CardTitle>
          <CardDescription>
            {mode === 'login' ? 'Sign in to your factory.' : 'Create the first account for this instance.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit.run();
            }}
          >
            <Field label="Email">
              <Input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </Field>
            <Field label="Password" hint={mode === 'register' ? 'At least 10 characters.' : undefined}>
              <Input
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={mode === 'register' ? 10 : undefined}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>

            {submit.error ? (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{submit.error}</p>
            ) : null}

            <Button type="submit" className="w-full" loading={submit.pending}>
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          {meta?.registrationOpen !== false ? (
            <button
              type="button"
              className="mt-4 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            >
              {mode === 'login' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
            </button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
