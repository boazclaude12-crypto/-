'use client';

import Link from 'next/link';
import { Factory, Zap } from 'lucide-react';
import { NoChannel, PageHeader } from '@/components/shell';
import { useAppState } from '@/components/app-state';
import { useMutation, useQuery } from '@/hooks/use-api';
import { api, type VideoStatus, type Overview } from '@/lib/api';
import { statusLabel } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { relativeTime } from '@/lib/utils';

/** The pipeline board of spec §7 — every stage, and what is sitting in it right now. */
const COLUMNS: Array<{ title: string; statuses: VideoStatus[] }> = [
  { title: 'Plan', statuses: ['IDEA', 'RESEARCHING', 'RESEARCH_COMPLETE'] },
  { title: 'Write', statuses: ['SCRIPTING', 'SCRIPT_READY', 'FACT_CHECK'] },
  { title: 'Produce', statuses: ['SCENE_PLANNING', 'GENERATING_VISUALS', 'GENERATING_VOICE', 'EDITING'] },
  { title: 'Finish', statuses: ['QC', 'THUMBNAIL', 'SEO'] },
  { title: 'Publish', statuses: ['READY', 'SCHEDULED', 'PUBLISHED'] },
];

interface VideoListResponse {
  items: Array<{
    id: string;
    title: string;
    status: VideoStatus;
    progress: Record<string, number> | null;
    completion: number;
    updatedAt: string;
    failureReason: string | null;
  }>;
  total: number;
}

export default function ProductionPage() {
  const { channelId } = useAppState();
  const { data, error, loading, refetch } = useQuery<VideoListResponse>(
    channelId ? `/api/videos?channelId=${channelId}&limit=100` : null,
    { pollMs: 10_000 },
  );
  const { data: overview } = useQuery<Overview>(channelId ? `/api/overview?channelId=${channelId}` : null);

  const generate = useMutation(async () => {
    const result = await api.post<{ video: { id: string } }>(`/api/channels/${channelId}/generate-video`, {});
    window.location.href = `/videos/${result.video.id}`;
  });

  if (!channelId) return <NoChannel />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (loading && !data) return <LoadingState />;

  const items = data?.items ?? [];
  const failed = items.filter((v) => v.status === 'FAILED');

  return (
    <>
      <PageHeader
        title="Production"
        description="One job per stage. A failure retries only the stage that broke, never the whole video."
        badge={
          overview ? (
            <Badge variant={overview.pipeline.buffer.deficit > 0 ? 'warning' : 'success'}>
              Buffer {overview.pipeline.buffer.scheduled + overview.pipeline.buffer.ready}/{overview.pipeline.buffer.target}
            </Badge>
          ) : undefined
        }
        actions={
          <Button size="sm" loading={generate.pending} onClick={() => void generate.run()}>
            <Zap className="h-4 w-4" aria-hidden />
            Generate a video
          </Button>
        }
      />

      {generate.error ? (
        <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{generate.error}</p>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title="Nothing in the pipeline"
          description="Approve an idea, or press Generate a video to let the factory choose."
          icon={<Factory className="h-7 w-7" />}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-5">
          {COLUMNS.map((column) => {
            const inColumn = items.filter((video) => column.statuses.includes(video.status));
            return (
              <div key={column.title} className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold">{column.title}</h2>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                    {inColumn.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {inColumn.map((video) => {
                    const percent = video.progress?.[video.status] ?? (video.status === 'PUBLISHED' ? 100 : 0);
                    return (
                      <Link
                        key={video.id}
                        href={`/videos/${video.id}`}
                        className="block rounded-lg border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-accent/40"
                      >
                        <p className="line-clamp-2 text-sm font-medium leading-snug">{video.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{statusLabel(video.status)}</p>
                        <Progress value={percent} className="mt-2 h-1.5" />
                        <p className="mt-1.5 text-[11px] text-muted-foreground">{relativeTime(video.updatedAt)}</p>
                      </Link>
                    );
                  })}
                  {inColumn.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                      Empty
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {failed.length > 0 ? (
        <Card className="mt-4 border-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive">Failed ({failed.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {failed.map((video) => (
              <Link key={video.id} href={`/videos/${video.id}`} className="block rounded-md border p-3 hover:bg-accent/40">
                <p className="text-sm font-medium">{video.title}</p>
                <p className="mt-0.5 text-xs text-destructive">{video.failureReason}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
