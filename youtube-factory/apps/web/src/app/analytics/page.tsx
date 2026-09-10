'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { NoChannel, PageHeader } from '@/components/shell';
import { useAppState } from '@/components/app-state';
import { useMutation, useQuery } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { Stat } from '@/components/stat';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDate, formatDuration, formatNumber, formatPercent } from '@/lib/utils';

interface AnalyticsResponse {
  since: string;
  videos: Array<{
    id: string; title: string; publishedAt: string | null; durationSec: number; qualityScore: number | null;
    views: number; watchTimeMinutes: number; averageViewPercentage: number; ctr: number;
    impressions: number; subscribersGained: number; likes: number; comments: number;
  }>;
  baseline: { videos: number; avgViews: number; avgCtr: number; avgViewPercentage: number; avgDurationSec: number };
  learnings: Array<{ dimension: string; observation: string; predicted: number | null; actual: number | null; delta: number | null; weight: number }>;
  strategy: { summary: string; weekStart: string; mix: { evergreen: number; trending: number; experimental: number }; recommendations: Array<{ topic: string; type: string; reason: string; priority: number }> } | null;
}

export default function AnalyticsPage() {
  const { channelId } = useAppState();
  const [days, setDays] = useState(30);
  const { data, error, loading, refetch } = useQuery<AnalyticsResponse>(
    channelId ? `/api/analytics?channelId=${channelId}&days=${days}` : null,
  );

  const runStrategy = useMutation(async () => {
    await api.post(`/api/analytics/${channelId}/strategy`);
    refetch();
  });

  if (!channelId) return <NoChannel />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (loading && !data) return <LoadingState />;
  if (!data) return null;

  const totals = data.videos.reduce(
    (acc, video) => ({
      views: acc.views + video.views,
      watch: acc.watch + video.watchTimeMinutes,
      subs: acc.subs + video.subscribersGained,
    }),
    { views: 0, watch: 0, subs: 0 },
  );

  return (
    <>
      <PageHeader
        title="Analytics"
        description="What the factory predicted, what actually happened, and what it concluded."
        actions={
          <>
            <div className="flex gap-1">
              {[7, 30, 90].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDays(option)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    days === option ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {option}d
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" loading={runStrategy.pending} onClick={() => void runStrategy.run()}>
              <Sparkles className="h-4 w-4" aria-hidden />
              Run strategist
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Views" value={formatNumber(totals.views)} hint={`${data.videos.length} videos`} />
        <Stat label="Watch time" value={`${formatNumber(totals.watch)} min`} />
        <Stat label="Average CTR" value={formatPercent(data.baseline.avgCtr)} hint="channel baseline" />
        <Stat label="Average viewed" value={formatPercent(data.baseline.avgViewPercentage)} hint={`avg length ${formatDuration(data.baseline.avgDurationSec)}`} />
      </div>

      {data.strategy ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>This week&apos;s plan</CardTitle>
            <CardDescription>
              {data.strategy.mix.evergreen} evergreen · {data.strategy.mix.trending} trending ·{' '}
              {data.strategy.mix.experimental} experimental
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">{data.strategy.summary}</p>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {data.strategy.recommendations.map((rec) => (
                <div key={rec.topic} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{rec.topic}</p>
                    <Badge variant="secondary">{rec.type}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{rec.reason}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Published videos</CardTitle>
        </CardHeader>
        <CardContent>
          {data.videos.length === 0 ? (
            <EmptyState title="Nothing published in this window" description="Analytics arrive a day after a video goes live." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Video</TH>
                  <TH>Published</TH>
                  <TH>Length</TH>
                  <TH>Views</TH>
                  <TH>CTR</TH>
                  <TH>Avg viewed</TH>
                  <TH>Subs</TH>
                </TR>
              </THead>
              <TBody>
                {data.videos.map((video) => (
                  <TR key={video.id}>
                    <TD className="max-w-xs">
                      <Link href={`/videos/${video.id}`} className="font-medium hover:underline">{video.title}</Link>
                    </TD>
                    <TD className="whitespace-nowrap text-muted-foreground">{formatDate(video.publishedAt, false)}</TD>
                    <TD className="text-muted-foreground">{formatDuration(video.durationSec)}</TD>
                    <TD className="tabular-nums">{formatNumber(video.views)}</TD>
                    <TD className="tabular-nums">{formatPercent(video.ctr)}</TD>
                    <TD className="tabular-nums">{formatPercent(video.averageViewPercentage)}</TD>
                    <TD className="tabular-nums">{formatNumber(video.subscribersGained)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>What the factory learned</CardTitle>
          <CardDescription>Weighted by how much evidence supports each observation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.learnings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing learned yet — learnings appear once videos have analytics.</p>
          ) : (
            data.learnings.map((learning, index) => (
              <div key={`${learning.dimension}-${index}`} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{learning.dimension}</Badge>
                  {learning.delta !== null ? (
                    <Badge variant={learning.delta >= 0 ? 'success' : 'destructive'}>
                      {learning.delta >= 0 ? '+' : ''}{learning.delta.toFixed(1)}
                    </Badge>
                  ) : null}
                  <span className="text-xs text-muted-foreground">weight {learning.weight.toFixed(2)}</span>
                </div>
                <p className="mt-1.5 text-sm">{learning.observation}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </>
  );
}
