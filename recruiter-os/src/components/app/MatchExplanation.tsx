'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Badge, ProgressBar, cx } from '../ui';
import { Icon } from '../ui/icons';

export interface RequirementCheckView {
  kind: string;
  value: string;
  required: boolean;
  met: boolean;
  evidence: string | null;
}

export interface MatchExplanationProps {
  score: number;
  title: string;
  subtitle?: string;
  href?: string;
  reasons: string[];
  gaps: string[];
  requirements: RequirementCheckView[];
  distanceKm: number | null;
  breakdown: Array<{ label: string; earned: number; max: number }>;
  badge?: string;
  action?: React.ReactNode;
}

function scoreTone(score: number): { ring: string; text: string; label: string } {
  if (score >= 85) return { ring: 'bg-ok/12', text: 'text-ok', label: 'התאמה גבוהה' };
  if (score >= 65) return { ring: 'bg-info/12', text: 'text-info', label: 'התאמה טובה' };
  if (score >= 45) return { ring: 'bg-warn/12', text: 'text-warn', label: 'התאמה חלקית' };
  return { ring: 'bg-line/60', text: 'text-muted', label: 'התאמה נמוכה' };
}

/**
 * A match is only useful if the recruiter can see *why*. This shows the score,
 * the reasons behind it, what is missing, and — on expand — the full requirement
 * checklist and the per-dimension breakdown that produced the number.
 */
export function MatchExplanation({
  score,
  title,
  subtitle,
  href,
  reasons,
  gaps,
  requirements,
  distanceKm,
  breakdown,
  badge,
  action,
}: MatchExplanationProps) {
  const [open, setOpen] = useState(false);
  const tone = scoreTone(score);

  return (
    <div>
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={cx(
            'num flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl text-sm font-semibold',
            tone.ring,
            tone.text,
          )}
          title={tone.label}
        >
          {score}%
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {href ? (
              <Link href={href} className="truncate text-sm font-semibold text-ink hover:text-brand">
                {title}
              </Link>
            ) : (
              <span className="truncate text-sm font-semibold text-ink">{title}</span>
            )}
            {badge && <Badge tone="slate">{badge}</Badge>}
            {distanceKm !== null && (
              <span className="num text-xs text-faint">
                {distanceKm === 0 ? 'באותה עיר' : `${distanceKm} ק"מ`}
              </span>
            )}
          </div>
          {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}

          {reasons.length > 0 && (
            <p className="mt-1 text-xs text-ok">{reasons.slice(0, 2).join(' · ')}</p>
          )}
          {gaps.length > 0 && (
            <p className="mt-0.5 text-xs text-warn">{gaps.slice(0, 2).join(' · ')}</p>
          )}

          <button
            onClick={() => setOpen((value) => !value)}
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand"
            aria-expanded={open}
          >
            {open ? 'הסתרת פירוט' : 'למה הציון הזה?'}
            <Icon.Plus size={12} className={cx('transition', open && 'rotate-45')} />
          </button>
        </div>

        {action && <div className="shrink-0">{action}</div>}
      </div>

      {open && (
        <div className="mt-3 grid gap-4 rounded-lg bg-bg p-3 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold text-muted">דרישות המשרה</p>
            {requirements.length === 0 ? (
              <p className="text-xs text-faint">למשרה לא הוגדרו דרישות מובנות.</p>
            ) : (
              <ul className="space-y-1.5">
                {requirements.map((requirement, index) => (
                  <li key={index} className="flex items-start gap-1.5 text-xs">
                    <span className={cx('mt-0.5', requirement.met ? 'text-ok' : 'text-danger')}>
                      {requirement.met ? <Icon.Check size={13} /> : <Icon.Alert size={13} />}
                    </span>
                    <span className="min-w-0">
                      <span className={cx(requirement.met ? 'text-ink' : 'text-muted')}>
                        {requirement.value}
                      </span>
                      {requirement.required && <span className="text-danger"> *</span>}
                      {requirement.evidence && (
                        <span className="block text-faint">מקור: {requirement.evidence}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-muted">מרכיבי הציון</p>
            <ul className="space-y-2">
              {breakdown.map((item) => (
                <li key={item.label}>
                  <div className="mb-0.5 flex items-baseline justify-between text-xs">
                    <span className="text-muted">{item.label}</span>
                    <span className="num text-faint">
                      {Math.round(item.earned)}/{item.max}
                    </span>
                  </div>
                  <ProgressBar
                    value={(item.earned / item.max) * 100}
                    tone={item.earned / item.max >= 0.7 ? 'ok' : item.earned / item.max >= 0.4 ? 'warn' : 'danger'}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
