'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Lightbulb, Play, RefreshCw, X } from 'lucide-react';
import { NoChannel, PageHeader } from '@/components/shell';
import { useAppState } from '@/components/app-state';
import { useMutation, useQuery } from '@/hooks/use-api';
import { api, type Idea } from '@/lib/api';
import { ScorePill } from '@/components/score';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { formatMoney, scoreBarTone } from '@/lib/utils';

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'PROPOSED', label: 'Proposed' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'IN_PRODUCTION', label: 'In production' },
  { value: 'REJECTED', label: 'Rejected' },
] as const;

export default function IdeasPage() {
  const router = useRouter();
  const { channelId } = useAppState();
  const [status, setStatus] = useState<string>('');
  const query = channelId ? `/api/ideas?channelId=${channelId}${status ? `&status=${status}` : ''}` : null;
  const { data, error, loading, refetch } = useQuery<{ ideas: Idea[] }>(query);

  const generate = useMutation(async () => {
    await api.post('/api/ideas/generate', { channelId, count: 5 });
    refetch();
  });
  const approve = useMutation(async (id: string) => {
    await api.post(`/api/ideas/${id}/approve`);
    refetch();
  });
  const reject = useMutation(async (id: string) => {
    await api.post(`/api/ideas/${id}/reject`);
    refetch();
  });
  const produce = useMutation(async (id: string) => {
    const result = await api.post<{ video: { id: string } }>(`/api/ideas/${id}/produce`, {});
    router.push(`/videos/${result.video.id}`);
  });

  if (!channelId) return <NoChannel />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  return (
    <>
      <PageHeader
        title="Ideas"
        description="Scored against demand, trend, competition, click-through and retention potential. The weights are yours to change in channel settings."
        actions={
          <Button size="sm" loading={generate.pending} onClick={() => void generate.run()}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Generate ideas
          </Button>
        }
      />

      {generate.error ? (
        <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{generate.error}</p>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setStatus(filter.value)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              status === filter.value ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {loading && !data ? <LoadingState /> : null}

      {data && data.ideas.length === 0 ? (
        <EmptyState
          title="No ideas yet"
          description="Generate a batch — the factory pulls trends, competitor patterns and what it has learned from your published videos."
          icon={<Lightbulb className="h-7 w-7" />}
          action={<Button size="sm" loading={generate.pending} onClick={() => void generate.run()}>Generate ideas</Button>}
        />
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {data?.ideas.map((idea) => {
          const contributions = idea.scoreBreakdown?.contributions ?? {};
          return (
            <Card key={idea.id}>
              <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                <div className="min-w-0">
                  <CardTitle className="text-sm leading-snug">{idea.title}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">{idea.topic}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <ScorePill score={idea.overallScore} />
                  <Badge variant={idea.status === 'APPROVED' ? 'success' : idea.status === 'REJECTED' ? 'destructive' : 'muted'}>
                    {idea.status.replace('_', ' ').toLowerCase()}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm">
                  <span className="font-medium text-muted-foreground">Hook: </span>
                  {idea.hook}
                </p>
                <p className="text-sm text-muted-foreground">{idea.angle}</p>

                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {([
                    { label: 'Demand', value: idea.estimatedDemand },
                    { label: 'Trend', value: idea.trendScore },
                    // Low competition is the desirable end of this scale, so its colour is inverted.
                    { label: 'Competition', value: idea.competition, inverted: true },
                    { label: 'CTR', value: idea.estimatedCtr },
                    { label: 'Retention', value: idea.estimatedRetention },
                    { label: 'Evergreen', value: idea.evergreenScore },
                  ] as const).map((metric) => (
                    <div key={metric.label} className="space-y-1">
                      <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{metric.label}</p>
                      <Progress
                        value={metric.value}
                        tone={scoreBarTone(metric.value, 'inverted' in metric && metric.inverted)}
                      />
                      <p className="text-[11px] font-medium tabular-nums">{Math.round(metric.value)}</p>
                    </div>
                  ))}
                </div>

                {Object.keys(contributions).length > 0 ? (
                  <details className="rounded-md bg-muted/50 px-3 py-2">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                      How this score was computed
                    </summary>
                    <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                      {Object.entries(contributions).map(([key, value]) => (
                        <li key={key} className="flex justify-between">
                          <span className="capitalize">{key}</span>
                          <span className="tabular-nums">+{value.toFixed(2)}</span>
                        </li>
                      ))}
                      <li className="flex justify-between border-t pt-1 font-medium text-foreground">
                        <span>Overall</span>
                        <span className="tabular-nums">{idea.overallScore}</span>
                      </li>
                    </ul>
                  </details>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">
                    Estimated production cost {formatMoney(idea.productionCostUsd)}
                  </span>
                  <div className="flex gap-1.5">
                    {idea.status === 'PROPOSED' ? (
                      <>
                        <Button variant="outline" size="sm" onClick={() => void reject.run(idea.id)}>
                          <X className="h-3.5 w-3.5" aria-hidden />
                          Reject
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => void approve.run(idea.id)}>
                          <Check className="h-3.5 w-3.5" aria-hidden />
                          Approve
                        </Button>
                      </>
                    ) : null}
                    {idea.status === 'APPROVED' || idea.status === 'PROPOSED' ? (
                      <Button size="sm" loading={produce.pending} onClick={() => void produce.run(idea.id)}>
                        <Play className="h-3.5 w-3.5" aria-hidden />
                        Produce
                      </Button>
                    ) : null}
                  </div>
                </div>
                {produce.error ? <p className="text-xs text-destructive">{produce.error}</p> : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
