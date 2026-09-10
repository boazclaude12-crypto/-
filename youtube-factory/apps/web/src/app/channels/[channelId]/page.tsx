'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Link2, Plus, Trash2, Unlink, Zap } from 'lucide-react';
import { PageHeader } from '@/components/shell';
import { useMutation, useQuery } from '@/hooks/use-api';
import { api, type BudgetStatus, type Channel, type ChannelSettings } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDate, formatNumber } from '@/lib/utils';

interface ChannelDetail {
  channel: Channel;
  settings: ChannelSettings;
  connected: boolean;
  scopes: string[];
  competitors: Array<{ id: string; name: string; youtubeChannelId: string; subscriberCount: number | null; avgViews: number | null; uploadFrequency: number | null; lastAnalyzedAt: string | null }>;
  sources: Array<{ id: string; kind: string; label: string; target: string; enabled: boolean; lastRunAt: string | null }>;
  rules: Array<{ id: string; name: string; condition: { metric: string; op: string; value: number }; action: { type: string }; enabled: boolean }>;
  upcomingSlots: string[];
  budget: BudgetStatus;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ChannelDetailPage({ params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = use(params);
  const { data, error, loading, refetch } = useQuery<ChannelDetail>(`/api/channels/${channelId}`);
  const [settings, setSettings] = useState<ChannelSettings | null>(null);

  useEffect(() => {
    if (data?.settings) setSettings(data.settings);
  }, [data?.settings]);

  const save = useMutation(async (patch: Partial<ChannelSettings>) => {
    await api.patch(`/api/channels/${channelId}`, { settings: patch });
    refetch();
  });

  const connect = useMutation(async () => {
    const result = await api.post<{ authorizeUrl: string }>(`/api/channels/${channelId}/connect`);
    window.location.href = result.authorizeUrl;
  });

  const disconnect = useMutation(async () => {
    await api.post(`/api/channels/${channelId}/disconnect`);
    refetch();
  });

  const toggleAutopilot = useMutation(async (enabled: boolean) => {
    await api.post(`/api/channels/${channelId}/autopilot`, { enabled });
    refetch();
  });

  const runAutopilot = useMutation(async () => {
    await api.post(`/api/channels/${channelId}/autopilot/run`);
    refetch();
  });

  const addCompetitor = useMutation(async (youtubeChannelId: string) => {
    await api.post(`/api/channels/${channelId}/competitors`, { youtubeChannelId });
    refetch();
  });

  const addSource = useMutation(async (payload: { kind: string; label: string; target: string }) => {
    await api.post(`/api/channels/${channelId}/sources`, payload);
    refetch();
  });

  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (loading && !data) return <LoadingState />;
  if (!data || !settings) return null;

  const update = (patch: Partial<ChannelSettings>) => setSettings({ ...settings, ...patch });

  return (
    <>
      <PageHeader
        title={data.channel.name}
        description={settings.niche}
        badge={data.connected ? <Badge variant="success">Connected to YouTube</Badge> : <Badge variant="muted">Not connected</Badge>}
        actions={
          <>
            {data.connected ? (
              <Button variant="outline" size="sm" loading={disconnect.pending} onClick={() => void disconnect.run()}>
                <Unlink className="h-4 w-4" aria-hidden />
                Disconnect
              </Button>
            ) : (
              <Button size="sm" loading={connect.pending} onClick={() => void connect.run()}>
                <Link2 className="h-4 w-4" aria-hidden />
                Connect YouTube
              </Button>
            )}
          </>
        }
      />

      {connect.error ? (
        <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{connect.error}</p>
      ) : null}

      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="automation">Automation</TabsTrigger>
          <TabsTrigger value="competitors">Competitors</TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          <form
            className="grid gap-4 lg:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              void save.run(settings);
            }}
          >
            <Card>
              <CardHeader>
                <CardTitle>Content profile</CardTitle>
                <CardDescription>What this channel makes, and for whom.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Field label="Niche">
                  <Input value={settings.niche} onChange={(e) => update({ niche: e.target.value })} />
                </Field>
                <Field label="Target audience">
                  <Input value={settings.targetAudience} onChange={(e) => update({ targetAudience: e.target.value })} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Language">
                    <Input value={settings.language} maxLength={5} onChange={(e) => update({ language: e.target.value })} />
                  </Field>
                  <Field label="Content style">
                    <Input value={settings.contentStyle} onChange={(e) => update({ contentStyle: e.target.value })} />
                  </Field>
                </div>
                <Field label="Visual style" hint="Fed to every image and video prompt.">
                  <Input value={settings.visualStyle} onChange={(e) => update({ visualStyle: e.target.value })} />
                </Field>
                <Field label="Thumbnail style">
                  <Input value={settings.thumbnailStyle} onChange={(e) => update({ thumbnailStyle: e.target.value })} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Music mood">
                    <Input value={settings.musicMood} onChange={(e) => update({ musicMood: e.target.value })} />
                  </Field>
                  <Field label="Voice id" hint="Leave empty to use the provider default.">
                    <Input value={settings.voiceId ?? ''} onChange={(e) => update({ voiceId: e.target.value })} />
                  </Field>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cadence and publishing</CardTitle>
                <CardDescription>When videos go out, and how long they are.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Videos per week">
                    <Input type="number" min={1} max={21} value={settings.videosPerWeek} onChange={(e) => update({ videosPerWeek: Number(e.target.value) })} />
                  </Field>
                  <Field label="Target length (minutes)">
                    <Input type="number" min={1} max={120} value={settings.targetDurationMin} onChange={(e) => update({ targetDurationMin: Number(e.target.value) })} />
                  </Field>
                  <Field label="Publish time">
                    <Input value={settings.defaultPublishTime} placeholder="18:00" onChange={(e) => update({ defaultPublishTime: e.target.value })} />
                  </Field>
                  <Field label="Timezone">
                    <Input value={settings.timezone} onChange={(e) => update({ timezone: e.target.value })} />
                  </Field>
                </div>
                <Field label="Publish days">
                  <div className="flex flex-wrap gap-1.5">
                    {DAYS.map((day, index) => {
                      const active = settings.publishDays.includes(index);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() =>
                            update({
                              publishDays: active
                                ? settings.publishDays.filter((d) => d !== index)
                                : [...settings.publishDays, index].sort(),
                            })
                          }
                          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                            active ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'
                          }`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </Field>
                <Field label="Default visibility">
                  <Select value={settings.privacyStatus} onChange={(e) => update({ privacyStatus: e.target.value })}>
                    <option value="private">Private</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="public">Public</option>
                  </Select>
                </Field>
                <Field label="Buffer target" hint="How many finished or in-flight videos to keep ahead of the schedule.">
                  <Input type="number" min={0} max={20} value={settings.bufferTargetVideos} onChange={(e) => update({ bufferTargetVideos: Number(e.target.value) })} />
                </Field>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Quality gates and budget</CardTitle>
                <CardDescription>
                  The pipeline refuses to publish anything that falls below these thresholds.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Monthly AI budget (USD)">
                  <Input type="number" min={0} value={settings.monthlyBudgetUsd} onChange={(e) => update({ monthlyBudgetUsd: Number(e.target.value) })} />
                </Field>
                <Field label="Max cost per video (USD)">
                  <Input type="number" min={0} step="0.5" value={settings.maxCostPerVideoUsd} onChange={(e) => update({ maxCostPerVideoUsd: Number(e.target.value) })} />
                </Field>
                <Field label="Minimum idea score">
                  <Input type="number" min={0} max={100} value={settings.minIdeaScore} onChange={(e) => update({ minIdeaScore: Number(e.target.value) })} />
                </Field>
                <Field label="Minimum QC score">
                  <Input type="number" min={0} max={100} value={settings.minQcScore} onChange={(e) => update({ minQcScore: Number(e.target.value) })} />
                </Field>
                <Field label="Minimum retention score">
                  <Input type="number" min={0} max={100} value={settings.minRetentionScore} onChange={(e) => update({ minRetentionScore: Number(e.target.value) })} />
                </Field>
                <Field label="Minimum fact confidence" hint="0 to 1. Below this, a video cannot publish automatically.">
                  <Input type="number" min={0} max={1} step="0.05" value={settings.minFactConfidence} onChange={(e) => update({ minFactConfidence: Number(e.target.value) })} />
                </Field>
              </CardContent>
            </Card>

            <div className="lg:col-span-2 flex items-center gap-3">
              <Button type="submit" loading={save.pending}>Save settings</Button>
              {save.error ? <p className="text-sm text-destructive">{save.error}</p> : null}
            </div>
          </form>
        </TabsContent>

        <TabsContent value="automation">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Autopilot</CardTitle>
                <CardDescription>
                  Once a day the factory crawls sources, scores ideas and starts exactly as many
                  videos as the buffer needs — never more than {settings.videosPerWeek} a week.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="text-sm font-medium">Autopilot</p>
                    <p className="text-xs text-muted-foreground">
                      {data.connected ? `Wakes at ${settings.autopilotRunAt} ${settings.timezone}` : 'Connect the channel to enable'}
                    </p>
                  </div>
                  <Switch
                    checked={settings.autopilotEnabled}
                    disabled={!data.connected || toggleAutopilot.pending}
                    onCheckedChange={(checked) => void toggleAutopilot.run(checked)}
                  />
                </div>
                {toggleAutopilot.error ? <p className="text-sm text-destructive">{toggleAutopilot.error}</p> : null}

                <Field label="Automation mode">
                  <Select
                    value={settings.automationMode}
                    onChange={(e) => void save.run({ automationMode: e.target.value as ChannelSettings['automationMode'] })}
                  >
                    <option value="FULL_AUTO">Full auto — produce and publish</option>
                    <option value="SEMI_AUTO">Semi auto — produce, then wait for approval</option>
                    <option value="MANUAL">Manual — I choose ideas myself</option>
                  </Select>
                </Field>
                <Field label="Daily wake-up time">
                  <Input value={settings.autopilotRunAt} onChange={(e) => update({ autopilotRunAt: e.target.value })} onBlur={() => void save.run({ autopilotRunAt: settings.autopilotRunAt })} />
                </Field>

                <Button variant="outline" size="sm" loading={runAutopilot.pending} onClick={() => void runAutopilot.run()}>
                  <Zap className="h-4 w-4" aria-hidden />
                  Run one pass now
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Automation rules</CardTitle>
                <CardDescription>Conditions checked at each gate in the pipeline.</CardDescription>
              </CardHeader>
              <CardContent>
                {data.rules.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No rules configured.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.rules.map((rule) => (
                      <li key={rule.id} className="rounded-md border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium">{rule.name}</p>
                          <Badge variant={rule.enabled ? 'success' : 'muted'}>{rule.enabled ? 'on' : 'off'}</Badge>
                        </div>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          if {rule.condition.metric} {rule.condition.op} {rule.condition.value} → {rule.action.type}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="competitors">
          <Card>
            <CardHeader>
              <CardTitle>Competitor channels</CardTitle>
              <CardDescription>
                Used to learn what topics and formats work in this niche. Nothing is ever copied.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const input = event.currentTarget.elements.namedItem('competitor') as HTMLInputElement;
                  if (input.value.trim()) {
                    void addCompetitor.run(input.value.trim());
                    input.value = '';
                  }
                }}
              >
                <Input name="competitor" placeholder="UCxxxxxxxxxxxxxxxxxxxxxx or @handle" className="max-w-sm" />
                <Button type="submit" size="sm" loading={addCompetitor.pending}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Track
                </Button>
              </form>
              {addCompetitor.error ? <p className="text-sm text-destructive">{addCompetitor.error}</p> : null}

              {data.competitors.length === 0 ? (
                <EmptyState title="No competitors tracked" description="Add a few channels in this niche to sharpen idea generation." />
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Channel</TH>
                      <TH>Subscribers</TH>
                      <TH>Avg views</TH>
                      <TH>Uploads/week</TH>
                      <TH>Last analysed</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.competitors.map((competitor) => (
                      <TR key={competitor.id}>
                        <TD className="font-medium">{competitor.name}</TD>
                        <TD className="tabular-nums">{formatNumber(competitor.subscriberCount)}</TD>
                        <TD className="tabular-nums">{formatNumber(competitor.avgViews)}</TD>
                        <TD className="tabular-nums">{competitor.uploadFrequency ?? '—'}</TD>
                        <TD className="text-muted-foreground">{formatDate(competitor.lastAnalyzedAt, false)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sources">
          <Card>
            <CardHeader>
              <CardTitle>Discovery sources</CardTitle>
              <CardDescription>Where the factory looks for topics worth covering.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                className="grid gap-2 sm:grid-cols-[140px_1fr_1fr_auto]"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const kind = (form.elements.namedItem('kind') as HTMLSelectElement).value;
                  const label = (form.elements.namedItem('label') as HTMLInputElement).value;
                  const target = (form.elements.namedItem('target') as HTMLInputElement).value;
                  if (label && target) {
                    void addSource.run({ kind, label, target });
                    form.reset();
                  }
                }}
              >
                <Select name="kind" defaultValue="RSS">
                  <option value="YOUTUBE">YouTube</option>
                  <option value="GOOGLE_TRENDS">Google Trends</option>
                  <option value="REDDIT">Reddit</option>
                  <option value="RSS">RSS</option>
                  <option value="NEWS_API">News API</option>
                  <option value="WIKIPEDIA">Wikipedia</option>
                  <option value="MANUAL">Manual topics</option>
                </Select>
                <Input name="label" placeholder="Label" />
                <Input name="target" placeholder="Feed URL, subreddit, query or country code" />
                <Button type="submit" size="sm" loading={addSource.pending}>Add</Button>
              </form>
              {addSource.error ? <p className="text-sm text-destructive">{addSource.error}</p> : null}

              <Table>
                <THead>
                  <TR>
                    <TH>Kind</TH>
                    <TH>Label</TH>
                    <TH>Target</TH>
                    <TH>Last crawled</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.sources.map((source) => (
                    <TR key={source.id}>
                      <TD><Badge variant="secondary">{source.kind}</Badge></TD>
                      <TD className="font-medium">{source.label}</TD>
                      <TD className="max-w-xs truncate font-mono text-xs text-muted-foreground">{source.target}</TD>
                      <TD className="text-muted-foreground">{formatDate(source.lastRunAt, false)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule">
          <Card>
            <CardHeader>
              <CardTitle>Upcoming slots</CardTitle>
              <CardDescription>
                {DAYS.filter((_, i) => settings.publishDays.includes(i)).join(', ')} at {settings.defaultPublishTime} ({settings.timezone})
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {data.upcomingSlots.map((slot) => (
                <div key={slot} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
                  <span>{formatDate(slot)}</span>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/calendar">
                      Calendar
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </Link>
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
