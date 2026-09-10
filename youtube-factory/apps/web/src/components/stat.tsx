import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

export function Stat({
  label,
  value,
  hint,
  icon,
  tone,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'destructive';
  className?: string;
}) {
  const accent = {
    default: 'text-foreground',
    success: 'text-success',
    warning: 'text-warning-foreground dark:text-warning',
    destructive: 'text-destructive',
  }[tone ?? 'default'];

  return (
    <Card className={className}>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={cn('text-2xl font-semibold tabular-nums leading-tight', accent)}>{value}</p>
          {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
        </div>
        {icon ? <div className="shrink-0 rounded-md bg-muted p-2 text-muted-foreground">{icon}</div> : null}
      </CardContent>
    </Card>
  );
}
