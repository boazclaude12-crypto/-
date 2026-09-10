import * as React from 'react';
import { cn } from '@/lib/utils';

export function Progress({
  value,
  className,
  tone = 'primary',
}: {
  value: number;
  className?: string;
  tone?: 'primary' | 'success' | 'warning' | 'destructive';
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const bar = {
    primary: 'bg-primary',
    success: 'bg-success',
    warning: 'bg-warning',
    destructive: 'bg-destructive',
  }[tone];

  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn('h-full rounded-full transition-all duration-500', bar)} style={{ width: `${clamped}%` }} />
    </div>
  );
}
