'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { NoChannel, PageHeader } from '@/components/shell';
import { useAppState } from '@/components/app-state';
import { useMutation, useQuery } from '@/hooks/use-api';
import { api, type VideoStatus } from '@/lib/api';
import { statusLabel } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { cn, formatDate } from '@/lib/utils';

interface CalendarEntry {
  kind: 'slot' | 'published';
  date: string;
  videoId: string | null;
  title: string | null;
  status: VideoStatus | null;
}

export default function CalendarPage() {
  const { channelId } = useAppState();
  const [monthOffset, setMonthOffset] = useState(0);
  const [dragging, setDragging] = useState<string | null>(null);

  const { from, to, monthLabel, days } = useMemo(() => buildMonth(monthOffset), [monthOffset]);
  const { data, error, loading, refetch } = useQuery<{ entries: CalendarEntry[] }>(
    channelId ? `/api/calendar?channelId=${channelId}&from=${from.toISOString()}&to=${to.toISOString()}` : null,
  );

  const reschedule = useMutation(async (videoId: string, date: Date) => {
    await api.patch(`/api/calendar/${videoId}`, { publishAt: date.toISOString() });
    refetch();
  });

  if (!channelId) return <NoChannel />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  const byDay = new Map<string, CalendarEntry[]>();
  for (const entry of data?.entries ?? []) {
    const key = new Date(entry.date).toISOString().slice(0, 10);
    byDay.set(key, [...(byDay.get(key) ?? []), entry]);
  }

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Drag a scheduled video onto another day to move it. Published videos stay where they are."
        actions={
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => setMonthOffset((n) => n - 1)} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-36 text-center text-sm font-medium">{monthLabel}</span>
            <Button variant="outline" size="icon" onClick={() => setMonthOffset((n) => n + 1)} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      {reschedule.error ? (
        <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{reschedule.error}</p>
      ) : null}
      {loading && !data ? <LoadingState /> : null}

      <Card>
        <CardContent className="p-3">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <div key={day} className="py-1.5">{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const key = day.date.toISOString().slice(0, 10);
              const entries = byDay.get(key) ?? [];
              const isToday = key === new Date().toISOString().slice(0, 10);
              return (
                <div
                  key={key}
                  onDragOver={(event) => {
                    if (dragging) event.preventDefault();
                  }}
                  onDrop={() => {
                    if (!dragging) return;
                    const target = new Date(day.date);
                    target.setUTCHours(18, 0, 0, 0);
                    void reschedule.run(dragging, target);
                    setDragging(null);
                  }}
                  className={cn(
                    'min-h-24 rounded-md border p-1.5 transition-colors',
                    day.inMonth ? 'bg-card' : 'bg-muted/30 text-muted-foreground',
                    isToday && 'border-primary',
                    dragging && 'hover:border-primary hover:bg-primary/5',
                  )}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className={cn('text-xs tabular-nums', isToday && 'font-semibold text-primary')}>
                      {day.date.getUTCDate()}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {entries.map((entry, index) => (
                      <div
                        key={`${key}-${index}`}
                        draggable={Boolean(entry.videoId) && entry.kind === 'slot' && entry.status !== 'PUBLISHED'}
                        onDragStart={() => entry.videoId && setDragging(entry.videoId)}
                        onDragEnd={() => setDragging(null)}
                        className={cn(
                          'rounded px-1.5 py-1 text-[11px] leading-tight',
                          entry.kind === 'published'
                            ? 'bg-success/15 text-success'
                            : entry.videoId
                              ? 'cursor-grab bg-primary/10 text-primary active:cursor-grabbing'
                              : 'border border-dashed text-muted-foreground',
                        )}
                      >
                        {entry.videoId ? (
                          <Link href={`/videos/${entry.videoId}`} className="line-clamp-2 hover:underline">
                            {entry.title}
                          </Link>
                        ) : (
                          'Open slot'
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 space-y-1.5">
        <h2 className="text-sm font-semibold">Upcoming</h2>
        {(data?.entries ?? [])
          .filter((entry) => new Date(entry.date) >= new Date())
          .slice(0, 10)
          .map((entry, index) => (
            <div key={`${entry.date}-${index}`} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{entry.title ?? 'Open slot'}</p>
                <p className="text-xs text-muted-foreground">{formatDate(entry.date)}</p>
              </div>
              {entry.status ? <Badge variant="secondary">{statusLabel(entry.status)}</Badge> : null}
            </div>
          ))}
      </div>
    </>
  );
}

function buildMonth(offset: number) {
  const now = new Date();
  const anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const monthLabel = anchor.toLocaleString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });

  // Grid starts on the Monday on or before the first of the month.
  const first = new Date(anchor);
  const weekday = (first.getUTCDay() + 6) % 7;
  const gridStart = new Date(first.getTime() - weekday * 86_400_000);

  const days = Array.from({ length: 42 }, (_, i) => {
    const date = new Date(gridStart.getTime() + i * 86_400_000);
    return { date, inMonth: date.getUTCMonth() === anchor.getUTCMonth() };
  });

  return {
    from: gridStart,
    to: new Date(gridStart.getTime() + 42 * 86_400_000),
    monthLabel,
    days,
  };
}
