'use client';

import { useState } from 'react';
import { Bell, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/shell';
import { useAppState } from '@/components/app-state';
import { useMutation, useQuery } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { channelState } from '@/lib/utils';

const EVENTS = [
  'IDEA_READY', 'SCRIPT_READY', 'VIDEO_READY', 'UPLOAD_SUCCESS', 'UPLOAD_FAILED',
  'BUDGET_WARNING', 'BUDGET_EXCEEDED', 'QC_FAILED', 'WEEKLY_REPORT', 'PIPELINE_FAILED',
];

interface TargetsResponse {
  targets: Array<{ id: string; kind: string; target: string; events: string[]; enabled: boolean }>;
  channels: Array<{ kind: string; configured: boolean; targetSuppliesEndpoint: boolean }>;
}

export default function SettingsPage() {
  const { user } = useAppState();
  const { data, error, loading, refetch } = useQuery<TargetsResponse>('/api/notifications/targets');
  const [kind, setKind] = useState('email');
  const [target, setTarget] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const addTarget = useMutation(async () => {
    await api.post('/api/notifications/targets', { kind, target, events: selected });
    setTarget('');
    setSelected([]);
    refetch();
  });

  const removeTarget = useMutation(async (id: string) => {
    await api.delete(`/api/notifications/targets/${id}`);
    refetch();
  });

  const changePassword = useMutation(async (currentPassword: string, newPassword: string) => {
    await api.post('/api/auth/password', { currentPassword, newPassword });
    window.location.reload();
  });

  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (loading && !data) return <LoadingState />;

  return (
    <>
      <PageHeader title="Settings" description="Your account and how the factory reaches you." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">{user?.email}</p>
                <p className="text-xs text-muted-foreground">{user?.name ?? 'No display name'}</p>
              </div>
              <Badge variant={user?.role === 'ADMIN' ? 'default' : 'muted'}>{user?.role?.toLowerCase()}</Badge>
            </div>

            <form
              className="space-y-3 border-t pt-3"
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const current = (form.elements.namedItem('current') as HTMLInputElement).value;
                const next = (form.elements.namedItem('next') as HTMLInputElement).value;
                void changePassword.run(current, next);
              }}
            >
              <Field label="Current password">
                <Input name="current" type="password" autoComplete="current-password" required />
              </Field>
              <Field label="New password" hint="At least 10 characters. Changing it signs out every other session.">
                <Input name="next" type="password" autoComplete="new-password" minLength={10} required />
              </Field>
              {changePassword.error ? <p className="text-sm text-destructive">{changePassword.error}</p> : null}
              <Button type="submit" variant="outline" size="sm" loading={changePassword.pending}>
                Change password
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>
              Pick where the factory tells you something needs attention. Leave events empty to receive everything.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {data?.channels.map((channel) => (
                <Badge key={channel.kind} variant={channel.configured ? 'success' : 'muted'}>
                  {channel.kind} {channelState(channel)}
                </Badge>
              ))}
            </div>

            <form
              className="space-y-3 border-t pt-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (target.trim()) void addTarget.run();
              }}
            >
              <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
                <Select value={kind} onChange={(event) => setKind(event.target.value)}>
                  <option value="email">Email</option>
                  <option value="telegram">Telegram</option>
                  <option value="discord">Discord</option>
                  <option value="slack">Slack</option>
                </Select>
                <Input
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  placeholder={
                    kind === 'telegram' ? 'Telegram chat id' : kind === 'email' ? 'you@example.com' : 'Webhook URL'
                  }
                />
              </div>

              <div className="flex flex-wrap gap-1">
                {EVENTS.map((event) => {
                  const active = selected.includes(event);
                  return (
                    <button
                      key={event}
                      type="button"
                      onClick={() => setSelected(active ? selected.filter((e) => e !== event) : [...selected, event])}
                      className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                        active ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'
                      }`}
                    >
                      {event.replace(/_/g, ' ').toLowerCase()}
                    </button>
                  );
                })}
              </div>

              {addTarget.error ? <p className="text-sm text-destructive">{addTarget.error}</p> : null}
              <Button type="submit" size="sm" loading={addTarget.pending}>
                <Plus className="h-4 w-4" aria-hidden />
                Add target
              </Button>
            </form>

            <div className="space-y-1.5 border-t pt-3">
              {data?.targets.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Bell className="h-4 w-4" aria-hidden />
                  No notification targets yet.
                </p>
              ) : (
                data?.targets.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm">
                        <span className="font-medium capitalize">{entry.kind}</span> · {entry.target}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {entry.events.length === 0 ? 'all events' : entry.events.join(', ').toLowerCase()}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => void removeTarget.run(entry.id)} aria-label="Remove">
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
