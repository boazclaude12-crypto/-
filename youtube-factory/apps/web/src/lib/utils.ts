import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

export function formatMoney(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return '—';
  if (value > 0 && value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(digits)}`;
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(digits)}%`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export function formatDate(value: string | Date | null | undefined, withTime = true): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
  });
}

export function relativeTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
    ['second', 1000],
  ];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === 'second') return formatter.format(Math.round(diff / ms), unit);
  }
  return '—';
}

/**
 * Progress-bar tone for a score. `inverted` is for metrics where a low number is the good
 * one — competition and cost — so the colour matches the meaning rather than the digits.
 */
export function scoreBarTone(
  score: number | null | undefined,
  inverted = false,
): 'primary' | 'success' | 'warning' | 'destructive' {
  if (score === null || score === undefined) return 'primary';
  const tone = scoreTone(inverted ? 100 - score : score);
  return tone === 'muted' ? 'primary' : tone;
}

/** Colour a 0-100 score consistently everywhere it appears. */
export function scoreTone(score: number | null | undefined): 'success' | 'warning' | 'destructive' | 'muted' {
  if (score === null || score === undefined) return 'muted';
  if (score >= 80) return 'success';
  if (score >= 60) return 'warning';
  return 'destructive';
}
