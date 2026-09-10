'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Plus, Radio, Users } from 'lucide-react';
import { PageHeader } from '@/components/shell';
import { useAppState } from '@/components/app-state';
import { useMutation, useQuery } from '@/hooks/use-api';
import { api, type Channel } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { formatNumber } from '@/lib/utils';

export default function ChannelsPage() {
  const { refresh } = useAppState();
  const { data, error, loading, refetch } = useQuery<{ channels: Channel[] }>('/api/channels');
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    name: '',
    niche: '',
    targetAudience: '',
    language: 'en',
    videosPerWeek: 3,
    targetDurationMin: 10,
    automationMode: 'SEMI_AUTO',
    monthlyBudgetUsd: 100,
  });

  const create = useMutation(async () => {
    await api.post('/api/channels', {
      name: form.name,
      settings: {
        niche: form.niche,
        targetAudience: form.targetAudience,
        language: form.language,
        videosPerWeek: Number(form.videosPerWeek),
        targetDurationMin: Number(form.targetDurationMin),
        automationMode: form.automationMode,
        monthlyBudgetUsd: Number(form.monthlyBudgetUsd),
      },
    });
    setOpen(false);
    setForm({ ...form, name: '', niche: '', targetAudience: '' });
    refetch();
    await refresh();
  });

  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (loading && !data) return <LoadingState />;

  return (
    <>
      <PageHeader
        title="Channels"
        description="Each channel has its own niche, voice, look, cadence and budget."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4" aria-hidden />
                New channel
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a channel</DialogTitle>
                <DialogDescription>
                  You can connect it to YouTube and fine-tune every setting afterwards.
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void create.run();
                }}
              >
                <Field label="Channel name">
                  <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="My History Channel" />
                </Field>
                <Field label="Niche" hint="What this channel is about. Drives research, ideas and visual style.">
                  <Input required value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} placeholder="European history, 1500-1900" />
                </Field>
                <Field label="Target audience">
                  <Input required value={form.targetAudience} onChange={(e) => setForm({ ...form, targetAudience: e.target.value })} placeholder="Curious adults who liked school history but never went further" />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Language">
                    <Input value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} maxLength={5} />
                  </Field>
                  <Field label="Videos per week">
                    <Input type="number" min={1} max={21} value={form.videosPerWeek} onChange={(e) => setForm({ ...form, videosPerWeek: Number(e.target.value) })} />
                  </Field>
                  <Field label="Target length (minutes)">
                    <Input type="number" min={1} max={120} value={form.targetDurationMin} onChange={(e) => setForm({ ...form, targetDurationMin: Number(e.target.value) })} />
                  </Field>
                  <Field label="Monthly AI budget (USD)">
                    <Input type="number" min={0} value={form.monthlyBudgetUsd} onChange={(e) => setForm({ ...form, monthlyBudgetUsd: Number(e.target.value) })} />
                  </Field>
                </div>
                <Field label="Automation mode" hint="Semi-auto produces everything and waits for your approval before scheduling.">
                  <Select value={form.automationMode} onChange={(e) => setForm({ ...form, automationMode: e.target.value })}>
                    <option value="FULL_AUTO">Full auto — publish without asking</option>
                    <option value="SEMI_AUTO">Semi auto — approve before scheduling</option>
                    <option value="MANUAL">Manual — I choose ideas myself</option>
                  </Select>
                </Field>

                {create.error ? (
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{create.error}</p>
                ) : null}

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" loading={create.pending}>Create channel</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {data && data.channels.length === 0 ? (
        <EmptyState
          title="No channels yet"
          description="A channel is the unit of production: niche, cadence, voice, look and budget."
          icon={<Radio className="h-7 w-7" />}
          action={<Button size="sm" onClick={() => setOpen(true)}>Create your first channel</Button>}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data?.channels.map((channel) => (
            <Card key={channel.id}>
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div className="min-w-0">
                  <CardTitle className="truncate">{channel.name}</CardTitle>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{channel.settings?.niche}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {channel.isDefault ? <Badge variant="secondary">Default</Badge> : null}
                  {channel.connected ? <Badge variant="success">Connected</Badge> : <Badge variant="muted">Not connected</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md bg-muted/50 p-2">
                    <p className="text-xs text-muted-foreground">Subscribers</p>
                    <p className="text-sm font-semibold tabular-nums">{formatNumber(channel.subscriberCount)}</p>
                  </div>
                  <div className="rounded-md bg-muted/50 p-2">
                    <p className="text-xs text-muted-foreground">Per week</p>
                    <p className="text-sm font-semibold tabular-nums">{channel.settings?.videosPerWeek ?? '—'}</p>
                  </div>
                  <div className="rounded-md bg-muted/50 p-2">
                    <p className="text-xs text-muted-foreground">Budget</p>
                    <p className="text-sm font-semibold tabular-nums">${channel.settings?.monthlyBudgetUsd ?? '—'}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Badge variant={channel.settings?.autopilotEnabled ? 'success' : 'muted'}>
                    {channel.settings?.autopilotEnabled ? 'Autopilot on' : 'Autopilot off'}
                  </Badge>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/channels/${channel.id}`}>Configure</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
