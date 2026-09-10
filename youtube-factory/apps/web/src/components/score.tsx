import { cn, scoreBarTone, scoreTone } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

export function ScorePill({ score, label }: { score: number | null | undefined; label?: string }) {
  const tone = scoreTone(score);
  const classes = {
    success: 'bg-success/15 text-success',
    warning: 'bg-warning/20 text-warning-foreground dark:text-warning',
    destructive: 'bg-destructive/15 text-destructive',
    muted: 'bg-muted text-muted-foreground',
  }[tone];

  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums', classes)}>
      {score === null || score === undefined ? '—' : Math.round(score)}
      {label ? <span className="font-normal opacity-80">{label}</span> : null}
    </span>
  );
}

export function ScoreBar({ label, score }: { label: string; score: number | null | undefined }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{score === null || score === undefined ? '—' : Math.round(score)}</span>
      </div>
      <Progress value={score ?? 0} tone={scoreBarTone(score)} />
    </div>
  );
}
