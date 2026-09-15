'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar, Badge, cx } from '../ui';
import { Icon } from '../ui/icons';
import { useToast } from '../ui/Toast';
import { api, errorMessage } from '@/lib/client/api';
import { relativeTime } from '@/lib/format';

export interface KanbanStage {
  key: string;
  label: string;
  color: string;
}

export interface KanbanCard {
  application_id: string;
  candidate_id: string;
  candidate_name: string;
  city: string | null;
  current_role: string | null;
  stage_key: string;
  status: string;
  match_score: number | null;
  updated_at: string;
  days_in_stage: number;
  next_interview_at: string | null;
  job_title?: string | null;
}

/**
 * Drag-and-drop pipeline.
 *
 * Uses the native HTML5 drag API (no dependency) and moves the card optimistically —
 * the stage change is persisted immediately and rolled back in the UI if the write fails.
 * Every column also has a keyboard-accessible menu, since drag-and-drop alone is not.
 */
export function KanbanBoard({
  stages,
  cards: initialCards,
  showJob = false,
}: {
  stages: KanbanStage[];
  cards: KanbanCard[];
  showJob?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [cards, setCards] = useState(initialCards);
  const [dragging, setDragging] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, KanbanCard[]>();
    for (const stage of stages) map.set(stage.key, []);
    for (const card of cards) {
      if (!map.has(card.stage_key)) map.set(card.stage_key, []);
      map.get(card.stage_key)!.push(card);
    }
    return map;
  }, [cards, stages]);

  async function move(applicationId: string, stageKey: string) {
    const card = cards.find((item) => item.application_id === applicationId);
    if (!card || card.stage_key === stageKey) return;

    const previous = card.stage_key;
    setCards((current) =>
      current.map((item) =>
        item.application_id === applicationId
          ? { ...item, stage_key: stageKey, days_in_stage: 0, updated_at: new Date().toISOString() }
          : item,
      ),
    );

    try {
      await api.post(`/api/applications/${applicationId}/stage`, { stage_key: stageKey });
      const label = stages.find((stage) => stage.key === stageKey)?.label ?? stageKey;
      toast.success(`${card.candidate_name} הועבר ל"${label}"`);
      router.refresh();
    } catch (error) {
      setCards((current) =>
        current.map((item) =>
          item.application_id === applicationId ? { ...item, stage_key: previous } : item,
        ),
      );
      toast.error(errorMessage(error));
    }
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {stages.map((stage) => {
        const stageCards = grouped.get(stage.key) ?? [];
        return (
          <section
            key={stage.key}
            onDragOver={(event) => {
              event.preventDefault();
              setOverStage(stage.key);
            }}
            onDragLeave={() => setOverStage((current) => (current === stage.key ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              setOverStage(null);
              const applicationId = event.dataTransfer.getData('text/plain');
              if (applicationId) void move(applicationId, stage.key);
            }}
            className={cx(
              'flex w-64 shrink-0 flex-col rounded-xl border bg-bg/60 transition',
              overStage === stage.key ? 'border-brand bg-brand-soft/60' : 'border-line',
            )}
            aria-label={stage.label}
          >
            <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
              <span className="flex items-center gap-1.5">
                <Badge tone={stage.color}>{stage.label}</Badge>
              </span>
              <span className="num text-xs text-faint">{stageCards.length}</span>
            </header>

            <div className="flex-1 space-y-2 p-2">
              {stageCards.length === 0 && (
                <p className="px-2 py-6 text-center text-xs text-faint">גרור לכאן מועמד</p>
              )}
              {stageCards.map((card) => (
                <article
                  key={card.application_id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', card.application_id);
                    event.dataTransfer.effectAllowed = 'move';
                    setDragging(card.application_id);
                  }}
                  onDragEnd={() => setDragging(null)}
                  className={cx(
                    'cursor-grab rounded-lg border border-line bg-surface p-2.5 shadow-card transition active:cursor-grabbing',
                    dragging === card.application_id && 'opacity-50',
                  )}
                >
                  <div className="flex items-start gap-2">
                    <Avatar name={card.candidate_name} size={28} />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/candidates/${card.candidate_id}`}
                        className="block truncate text-sm font-medium text-ink hover:text-brand"
                      >
                        {card.candidate_name}
                      </Link>
                      <p className="truncate text-xs text-faint">
                        {[card.current_role, card.city].filter(Boolean).join(' · ') || '—'}
                      </p>
                      {showJob && card.job_title && (
                        <p className="truncate text-xs text-muted">{card.job_title}</p>
                      )}
                    </div>
                    {card.match_score != null && (
                      <span className="num shrink-0 rounded-md bg-brand-soft px-1.5 py-0.5 text-[11px] font-semibold text-brand">
                        {Math.round(card.match_score)}%
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span
                      className={cx(
                        'num text-[11px]',
                        card.days_in_stage >= 7 ? 'text-warn' : 'text-faint',
                      )}
                    >
                      {card.days_in_stage === 0 ? 'היום' : `${card.days_in_stage} ימים בשלב`}
                    </span>
                    {card.next_interview_at && (
                      <span className="flex items-center gap-1 text-[11px] text-info">
                        <Icon.Calendar size={11} />
                        {relativeTime(card.next_interview_at)}
                      </span>
                    )}
                  </div>

                  <label className="mt-2 block">
                    <span className="sr-only">העברת {card.candidate_name} לשלב אחר</span>
                    <select
                      value={card.stage_key}
                      onChange={(event) => move(card.application_id, event.target.value)}
                      className="w-full rounded-md border border-line bg-bg px-1.5 py-1 text-[11px] text-muted focus:border-brand focus:outline-none"
                    >
                      {stages.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
