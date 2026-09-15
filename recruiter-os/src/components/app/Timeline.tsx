import React from 'react';
import { Dot } from '../ui';
import { relativeTime, formatDateTime } from '@/lib/format';

export interface TimelineEntry {
  id: string;
  type: string;
  actor: string;
  summary: string;
  created_at: string;
}

/** Colour by event family, so a timeline is scannable without reading every line. */
function toneFor(type: string): string {
  if (type.startsWith('placement') || type.includes('hired') || type === 'payment.received') return 'ok';
  if (type.includes('rejected') || type.includes('fallen')) return 'danger';
  if (type.startsWith('message') || type.startsWith('interview')) return 'info';
  if (type.startsWith('automation')) return 'warn';
  return 'muted';
}

export function Timeline({ entries, emptyText = 'אין עדיין פעילות' }: { entries: TimelineEntry[]; emptyText?: string }) {
  if (entries.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-faint">{emptyText}</p>;
  }

  return (
    <ol className="relative space-y-0 px-4 py-2">
      {entries.map((entry, index) => (
        <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
          {index < entries.length - 1 && (
            <span className="absolute right-[3px] top-4 h-full w-px bg-line" aria-hidden />
          )}
          <span className="relative z-10 mt-1.5">
            <Dot tone={toneFor(entry.type)} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-ink">{entry.summary}</span>
            <span className="block text-xs text-faint" title={formatDateTime(entry.created_at)}>
              {relativeTime(entry.created_at)}
              {entry.actor === 'automation' && ' · אוטומציה'}
              {entry.actor === 'system' && ' · מערכת'}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
