'use client';

import Link from 'next/link';
import {
  Activity, Clock, Eye, MousePointerClick, PlayCircle, TrendingUp, UserPlus, Wallet,
} from 'lucide-react';
import { useAppState } from '@/components/app-state';
import { NoChannel, PageHeader } from '@/components/shell';
import { Stat } from '@/components/stat';
import { StatusBadge } from '@/components/status-badge';
import { useQuery } from '@/hooks/use-api';
import type { Overview } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { formatDate, formatDuration, formatMoney, formatNumber, formatPercent } from '@/lib/utils';

export default function DashboardPage() {
  const { channelId, loading: appLoading } = useAppState();
  // Polls while something is in production so the pipeline card stays live.
  const { data, error, loading, refetch } = useQuery<Overview>(
    channelId ? `/api/overview?channelId=${channelId}` : null,
    { pollMs: 15_000 },
  );

  if (appLoading) return <LoadingState />;
  if (!channelId) return <NoChannel />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (loading && !data) return <LoadingState />;
  if (!data) return null;

  const { metrics, pipeline, budget, thisWeek } = data;

  return (
    <>
      <PageHeader
        title={data.channel.name}
        description={`${data.settings.automationMode.replace('_', ' ').toLowerCase()} · ${data.settings.videosPerWeek} videos per week`}
        badge={
          data.settings.autopilotEnabled ? (
            <Badge variant="success">Autopilot on</Badge>
          ) : (
            <Badge variant="muted">Autopilot off</Badge>
          )
        }
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/ideas">Review ideas</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/production">Production board</Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Videos this week"
          value={thisWeek.created}
          hint={`${thisWeek.published} published · ${thisWeek.scheduled} scheduled`}
          icon={<PlayCircle className="h-4 w-4" />}
        />
        <Stat
          label="Views"
          value={formatNumber(metrics.views)}
          hint={`${metrics.videosMeasured} videos measured`}
          icon={<Eye className="h-4 w-4" />}
        />
        <Stat
          label="Watch time"
          value={`${formatNumber(metrics.watchTimeMinutes)} min`}
          hint={`Avg view ${formatDuration(metrics.averageViewDuration)}`}
          icon={<Clock className="h-4 w-4" />}
        />
        <Stat
          label="Click-through rate"
          value={formatPercent(metrics.ctr)}
          hint={`${formatNumber(metrics.impressions)} impressions`}
          icon={<MousePointerClick className="h-4 w-4" />}
        />
        <Stat
          label="Subscribers gained"
          value={formatNumber(metrics.subscribersGained)}
          icon={<UserPlus className="h-4 w-4" />}
        />
        <Stat
          label="Estimated revenue"
          value={metrics.estimatedRevenueUsd ? formatMoney(metrics.estimatedRevenueUsd) : '—'}
          hint={metrics.estimatedRevenueUsd ? undefined : 'Not reported by the API'}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <Stat
          label="AI spend this month"
          value={formatMoney(budget.spentUsd)}
          hint={`of ${formatMoney(budget.budgetUsd)} · projected ${formatMoney(budget.projectedMonthEndUsd)}`}
          tone={budget.level === 'exceeded' ? 'destructive' : budget.level === 'ok' ? 'default' : 'warning'}
          icon={<Wallet className="h-4 w-4" />}
        />
        <Stat
          label="Buffer"
          value={`${pipeline.buffer.scheduled + pipeline.buffer.ready}/${pipeline.buffer.target}`}
          hint={
            pipeline.buffer.deficit > 0
              ? `${pipeline.buffer.deficit} more needed`
              : 'Healthy — enough work queued'
          }
          tone={pipeline.buffer.deficit > 0 ? 'warning' : 'success'}
          icon={<Activity className="h-4 w-4" />}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>In production</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/production">Open board</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {pipeline.inFlight.length === 0 ? (
              <EmptyState
                title="Nothing in production"
                description="Approve an idea, or turn on autopilot to let the factory pick one."
                action={
                  <Button asChild size="sm">
                    <Link href="/ideas">Review ideas</Link>
                  </Button>
                }
              />
            ) : (
              pipeline.inFlight.map((video) => {
                const percent = video.progress?.[video.status] ?? 0;
                return (
                  <Link
                    key={video.id}
                    href={`/videos/${video.id}`}
                    className="block rounded-lg border p-3 transition-colors hover:bg-accent/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">{video.title}</p>
                      <StatusBadge status={video.status} />
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <Progress value={percent} className="flex-1" />
                      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {Math.round(percent)}%
                      </span>
                    </div>
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Best and worst</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.topVideo ? (
                <Link href={`/videos/${data.topVideo.id}`} className="block rounded-md border p-3 hover:bg-accent/50">
                  <Badge variant="success">Top</Badge>
                  <p className="mt-1.5 truncate text-sm font-medium">{data.topVideo.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatNumber(data.topVideo.views)} views · {formatPercent(data.topVideo.ctr)} CTR
                  </p>
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground">No published video has analytics yet.</p>
              )}
              {data.worstVideo && data.worstVideo.id !== data.topVideo?.id ? (
                <Link href={`/videos/${data.worstVideo.id}`} className="block rounded-md border p-3 hover:bg-accent/50">
                  <Badge variant="muted">Weakest</Badge>
                  <p className="mt-1.5 truncate text-sm font-medium">{data.worstVideo.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatNumber(data.worstVideo.views)} views · {formatPercent(data.worstVideo.ctr)} CTR
                  </p>
                </Link>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Next publishing slots</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {data.upcomingSlots.slice(0, 5).map((slot) => (
                <div key={slot} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
                  <span>{formatDate(slot)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
