'use client';

import Link from 'next/link';
import { NoChannel, PageHeader } from '@/components/shell';
import { useAppState } from '@/components/app-state';
import { useQuery } from '@/hooks/use-api';
import type { BudgetStatus } from '@/lib/api';
import { Stat } from '@/components/stat';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDate, formatMoney } from '@/lib/utils';

interface CostsResponse {
  month: { start: string; end: string };
  total: number;
  byProvider: Array<{ provider: string; cost: number; calls: number }>;
  channels: Array<{ channelId: string; name: string; budget: BudgetStatus }>;
  videos: Array<{ videoId: string; title: string; status: string; costUsd: number; costPerMinuteUsd: number }>;
  recent: Array<{ createdAt: string; provider: string; operation: string; model: string | null; costUsd: number; latencyMs: number; status: string }>;
}

export default function CostsPage() {
  const { channelId } = useAppState();
  const { data, error, loading, refetch } = useQuery<CostsResponse>(
    channelId ? `/api/costs?channelId=${channelId}` : '/api/costs',
  );

  if (!channelId) return <NoChannel />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (loading && !data) return <LoadingState />;
  if (!data) return null;

  const channel = data.channels[0];
  const maxProviderCost = Math.max(0.0001, ...data.byProvider.map((p) => p.cost));

  return (
    <>
      <PageHeader
        title="Costs"
        description="Every provider call is metered. These are the numbers the budget guard acts on."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Spent this month" value={formatMoney(data.total)} hint={formatDate(data.month.start, false)} />
        <Stat
          label="Budget"
          value={channel ? formatMoney(channel.budget.budgetUsd) : '—'}
          hint={channel ? `${formatMoney(channel.budget.remainingUsd)} remaining` : undefined}
        />
        <Stat
          label="Projected month end"
          value={channel ? formatMoney(channel.budget.projectedMonthEndUsd) : '—'}
          tone={
            channel && channel.budget.projectedMonthEndUsd > channel.budget.budgetUsd ? 'destructive' : 'default'
          }
        />
        <Stat
          label="Utilisation"
          value={channel ? `${Math.round(channel.budget.utilisation * 100)}%` : '—'}
          tone={
            channel?.budget.level === 'exceeded'
              ? 'destructive'
              : channel?.budget.level === 'ok'
                ? 'success'
                : 'warning'
          }
          hint={channel?.budget.blocked ? 'Non-essential generation is paused' : undefined}
        />
      </div>

      {channel ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Budget protection</CardTitle>
            <CardDescription>
              Warnings at 80% and 90%; at 100% every non-essential operation stops until you raise the budget.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress
              value={channel.budget.utilisation * 100}
              tone={
                channel.budget.level === 'exceeded'
                  ? 'destructive'
                  : channel.budget.level === 'ok'
                    ? 'success'
                    : 'warning'
              }
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatMoney(channel.budget.spentUsd)} spent</span>
              <span>{formatMoney(channel.budget.budgetUsd)} budget</span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By provider</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.byProvider.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing spent yet this month.</p>
            ) : (
              data.byProvider.map((provider) => (
                <div key={provider.provider} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium capitalize">{provider.provider}</span>
                    <span className="tabular-nums">{formatMoney(provider.cost, 4)}</span>
                  </div>
                  <Progress value={(provider.cost / maxProviderCost) * 100} />
                  <p className="text-xs text-muted-foreground">{provider.calls} calls</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cost per video</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Video</TH>
                  <TH>Cost</TH>
                  <TH>Per minute</TH>
                </TR>
              </THead>
              <TBody>
                {data.videos.map((video) => (
                  <TR key={video.videoId}>
                    <TD className="max-w-xs">
                      <Link href={`/videos/${video.videoId}`} className="truncate font-medium hover:underline">
                        {video.title}
                      </Link>
                    </TD>
                    <TD className="tabular-nums">{formatMoney(video.costUsd, 4)}</TD>
                    <TD className="tabular-nums text-muted-foreground">{formatMoney(video.costPerMinuteUsd, 4)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Recent provider calls</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Provider</TH>
                <TH>Operation</TH>
                <TH>Model</TH>
                <TH>Latency</TH>
                <TH>Cost</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {data.recent.map((call, index) => (
                <TR key={`${call.createdAt}-${index}`}>
                  <TD className="whitespace-nowrap text-muted-foreground">{formatDate(call.createdAt)}</TD>
                  <TD className="capitalize">{call.provider}</TD>
                  <TD className="font-mono text-xs">{call.operation}</TD>
                  <TD className="text-muted-foreground">{call.model ?? '—'}</TD>
                  <TD className="tabular-nums text-muted-foreground">{call.latencyMs}ms</TD>
                  <TD className="tabular-nums">{formatMoney(call.costUsd, 4)}</TD>
                  <TD>
                    <Badge variant={call.status === 'ok' ? 'success' : 'destructive'}>{call.status}</Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
