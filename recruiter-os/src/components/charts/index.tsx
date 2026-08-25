'use client';

import React, { useId, useState } from 'react';
import { cx } from '../ui';

/**
 * Inline-SVG charts.
 *
 * No charting library: each form is a handful of rects with a hover layer. Colours come
 * from `--chart-1` / `--chart-2`, which are re-stepped per theme in globals.css and were
 * validated with the palette checker (lightness band, chroma, CVD separation, contrast).
 * Marks are thin, rounded only at the data end, and separated by a 2px surface gap.
 */

const SERIES_VAR = ['var(--chart-1)', 'var(--chart-2)'] as const;

export interface Series {
  key: string;
  label: string;
}

export interface ChartRow {
  label: string;
  values: number[];
  /** Optional extra line shown in the tooltip. */
  meta?: string;
}

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
      {series.map((item, index) => (
        <li key={item.key} className="flex items-center gap-1.5 text-xs text-muted">
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{ background: `rgb(${SERIES_VAR[index % SERIES_VAR.length]})` }}
            aria-hidden
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

interface TooltipState {
  x: number;
  y: number;
  title: string;
  lines: string[];
}

function Tooltip({ state }: { state: TooltipState | null }) {
  if (!state) return null;
  return (
    <div
      className="pointer-events-none absolute z-20 min-w-[7rem] -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-pop"
      style={{ left: state.x, top: state.y - 8 }}
      role="tooltip"
    >
      <p className="font-medium text-ink">{state.title}</p>
      {state.lines.map((line) => (
        <p key={line} className="num text-muted">{line}</p>
      ))}
    </div>
  );
}

/**
 * Vertical grouped bars — for a measure over time. One y-axis only, always:
 * two measures of different scale belong in two charts, not on two axes.
 */
export function GroupedBarChart({
  rows,
  series,
  format = (value: number) => String(value),
  height = 200,
  emptyText = 'אין נתונים להצגה',
}: {
  rows: ChartRow[];
  series: Series[];
  format?: (value: number) => string;
  height?: number;
  emptyText?: string;
}) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const gradientId = useId();

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-faint">{emptyText}</p>;
  }

  const max = Math.max(1, ...rows.flatMap((row) => row.values));
  const plotHeight = height - 26;
  const groupWidth = 100 / rows.length;
  const barCount = series.length;
  // 2px surface gap between adjacent bars is expressed as a share of the group.
  const barWidth = (groupWidth * 0.62) / barCount;

  return (
    <div className="relative">
      <Legend series={series} />
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`תרשים עמודות: ${series.map((s) => s.label).join(', ')}`}
      >
        <defs>
          <linearGradient id={gradientId}>
            <stop offset="0%" stopColor="transparent" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((ratio) => (
          <line
            key={ratio}
            x1="0"
            x2="100"
            y1={plotHeight - ratio * plotHeight}
            y2={plotHeight - ratio * plotHeight}
            stroke="rgb(var(--chart-grid))"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {rows.map((row, rowIndex) => {
          // RTL: the first period sits on the right.
          const groupStart = 100 - (rowIndex + 1) * groupWidth;
          return (
            <g key={row.label}>
              {row.values.map((value, seriesIndex) => {
                const barHeight = Math.max(value > 0 ? 2 : 0, (value / max) * plotHeight);
                const x = groupStart + groupWidth * 0.19 + seriesIndex * barWidth;
                return (
                  <rect
                    key={seriesIndex}
                    x={x}
                    y={plotHeight - barHeight}
                    width={Math.max(0.5, barWidth - 0.6)}
                    height={barHeight}
                    rx="0.6"
                    fill={`rgb(${SERIES_VAR[seriesIndex % SERIES_VAR.length]})`}
                    onMouseEnter={(event) => {
                      const box = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
                      setTooltip({
                        x: ((x + barWidth / 2) / 100) * box.width,
                        y: ((plotHeight - barHeight) / height) * box.height,
                        title: row.label,
                        lines: row.values.map(
                          (item, index) => `${series[index]?.label ?? ''}: ${format(item)}`,
                        ),
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                );
              })}
              <text
                x={groupStart + groupWidth / 2}
                y={height - 8}
                textAnchor="middle"
                fill="rgb(var(--c-faint))"
                style={{ fontSize: '7px' }}
              >
                {row.label}
              </text>
            </g>
          );
        })}
      </svg>
      <Tooltip state={tooltip} />
    </div>
  );
}

/**
 * Horizontal bars for ranked categories. Single series, so no legend — the title
 * names the measure — and every bar is directly labelled with its value.
 */
export function RankedBars({
  rows,
  format = (value: number) => String(value),
  emptyText = 'אין נתונים להצגה',
  seriesIndex = 0,
}: {
  rows: Array<{ label: string; value: number; sub?: string; href?: string }>;
  format?: (value: number) => string;
  emptyText?: string;
  seriesIndex?: number;
}) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-faint">{emptyText}</p>;
  }
  const max = Math.max(1, ...rows.map((row) => row.value));

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm text-ink">{row.label}</span>
            <span className="num shrink-0 text-sm font-medium text-ink">{format(row.value)}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-line/50">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(2, (row.value / max) * 100)}%`,
                background: `rgb(${SERIES_VAR[seriesIndex % SERIES_VAR.length]})`,
              }}
            />
          </div>
          {row.sub && <p className="mt-0.5 text-xs text-faint">{row.sub}</p>}
        </li>
      ))}
    </ul>
  );
}

/** Recruitment funnel: absolute counts plus the conversion rate off the top of funnel. */
export function Funnel({
  steps,
  emptyText = 'אין עדיין נתוני פייפליין',
}: {
  steps: Array<{ label: string; count: number; rate: number | null }>;
  emptyText?: string;
}) {
  const top = steps[0]?.count ?? 0;
  if (top === 0) {
    return <p className="py-8 text-center text-sm text-faint">{emptyText}</p>;
  }

  return (
    <ol className="space-y-2">
      {steps.map((step, index) => {
        const width = Math.max(3, (step.count / top) * 100);
        const dropoff =
          index > 0 && steps[index - 1]!.count > 0
            ? Math.round((1 - step.count / steps[index - 1]!.count) * 100)
            : null;
        return (
          <li key={step.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="text-sm text-ink">{step.label}</span>
              <span className="flex items-baseline gap-2">
                <span className="num text-sm font-medium text-ink">{step.count}</span>
                {step.rate !== null && <span className="num text-xs text-faint">{step.rate}%</span>}
              </span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-md bg-line/40">
              <div
                className={cx('h-full rounded-md transition-all')}
                style={{
                  width: `${width}%`,
                  background: `rgb(var(--chart-1) / ${1 - index * 0.11})`,
                }}
              />
            </div>
            {dropoff !== null && dropoff > 0 && (
              <p className="mt-0.5 text-xs text-faint">נשירה של {dropoff}% מהשלב הקודם</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
