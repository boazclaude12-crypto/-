'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Video } from 'lucide-react';
import { NoChannel, PageHeader } from '@/components/shell';
import { useAppState } from '@/components/app-state';
import { useQuery } from '@/hooks/use-api';
import type { VideoSummary } from '@/lib/api';
import { ScorePill } from '@/components/score';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDate, formatDuration, formatMoney } from '@/lib/utils';

const GROUPS = [
  { value: '', label: 'All' },
  { value: 'IDEA,RESEARCHING,RESEARCH_COMPLETE,SCRIPTING,SCRIPT_READY,FACT_CHECK,SCENE_PLANNING,GENERATING_VISUALS,GENERATING_VOICE,EDITING,QC,THUMBNAIL,SEO', label: 'In production' },
  { value: 'READY,SCHEDULED', label: 'Ready & scheduled' },
  { value: 'PUBLISHED,ANALYZING', label: 'Published' },
  { value: 'FAILED', label: 'Failed' },
];

export default function VideosPage() {
  const { channelId } = useAppState();
  const [filter, setFilter] = useState('');
  const { data, error, loading, refetch } = useQuery<{ items: VideoSummary[]; total: number }>(
    channelId ? `/api/videos?channelId=${channelId}&limit=100${filter ? `&status=${filter}` : ''}` : null,
    { pollMs: 20_000 },
  );

  if (!channelId) return <NoChannel />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  return (
    <>
      <PageHeader title="Videos" description={data ? `${data.total} videos on this channel.` : undefined} />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {GROUPS.map((group) => (
          <button
            key={group.label}
            type="button"
            onClick={() => setFilter(group.value)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === group.value ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            {group.label}
          </button>
        ))}
      </div>

      {loading && !data ? <LoadingState /> : null}

      {data && data.items.length === 0 ? (
        <EmptyState
          title="No videos here"
          description="Approve an idea on the Ideas screen to start one."
          icon={<Video className="h-7 w-7" />}
          action={
            <Button asChild size="sm">
              <Link href="/ideas">Go to ideas</Link>
            </Button>
          }
        />
      ) : null}

      {data && data.items.length > 0 ? (
        <div className="rounded-lg border bg-card">
          <Table>
            <THead>
              <TR>
                <TH>Title</TH>
                <TH>Status</TH>
                <TH className="w-40">Progress</TH>
                <TH>Quality</TH>
                <TH>Length</TH>
                <TH>Cost</TH>
                <TH>Publish</TH>
              </TR>
            </THead>
            <TBody>
              {data.items.map((video) => (
                <TR key={video.id}>
                  <TD className="max-w-xs">
                    <Link href={`/videos/${video.id}`} className="font-medium hover:underline">
                      {video.title}
                    </Link>
                    {video.failureReason ? (
                      <p className="mt-0.5 line-clamp-1 text-xs text-destructive">{video.failureReason}</p>
                    ) : null}
                  </TD>
                  <TD><StatusBadge status={video.status} /></TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <Progress value={video.completion} className="h-1.5 w-24" />
                      <span className="text-xs tabular-nums text-muted-foreground">{video.completion}%</span>
                    </div>
                  </TD>
                  <TD><ScorePill score={video.qualityScore} /></TD>
                  <TD className="whitespace-nowrap text-muted-foreground">
                    {formatDuration(video.actualDurationSec ?? video.targetDurationSec)}
                  </TD>
                  <TD className="tabular-nums text-muted-foreground">{formatMoney(video.actualCostUsd)}</TD>
                  <TD className="whitespace-nowrap text-muted-foreground">
                    {formatDate(video.publishedAt ?? video.publishAt, false)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      ) : null}
    </>
  );
}
