'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, cx } from '../ui';
import { useToast } from '../ui/Toast';
import { api, errorMessage } from '@/lib/client/api';
import { relativeTime } from '@/lib/format';
import { labelOf, TASK_PRIORITIES } from '@/lib/domain/constants';

export interface ChecklistTask {
  id: string;
  title: string;
  details?: string | null;
  due_at: string | null;
  priority: string;
  status: string;
  is_overdue?: number;
  candidate_id?: string | null;
  candidate_name?: string | null;
  client_name?: string | null;
  job_title?: string | null;
  created_by?: string;
}

const PRIORITY_TONE: Record<string, string> = {
  urgent: 'rose',
  high: 'amber',
  normal: 'sky',
  low: 'slate',
};

/** Ticking a task writes to the database immediately and re-renders the server data. */
export function TaskChecklist({ tasks, showLinks = true }: { tasks: ChecklistTask[]; showLinks?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  async function toggle(task: ChecklistTask) {
    const nextStatus = task.status === 'done' || done.has(task.id) ? 'open' : 'done';
    setBusyId(task.id);
    try {
      await api.patch(`/api/tasks/${task.id}`, { status: nextStatus });
      setDone((current) => {
        const next = new Set(current);
        if (nextStatus === 'done') next.add(task.id);
        else next.delete(task.id);
        return next;
      });
      if (nextStatus === 'done') toast.success('המשימה סומנה כהושלמה');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <ul className="divide-y divide-line">
      {tasks.map((task) => {
        const isDone = task.status === 'done' || done.has(task.id);
        const context = [task.candidate_name, task.job_title, task.client_name].filter(Boolean).join(' · ');
        return (
          <li key={task.id} className="flex items-start gap-3 px-4 py-3">
            <button
              onClick={() => toggle(task)}
              disabled={busyId === task.id}
              aria-label={isDone ? 'סימון כלא בוצע' : 'סימון כבוצע'}
              className={cx(
                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition',
                isDone ? 'border-ok bg-ok text-white' : 'border-line hover:border-brand',
              )}
            >
              {isDone && (
                <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <path d="m4 10.5 4 4 8-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                </svg>
              )}
            </button>

            <div className="min-w-0 flex-1">
              <p className={cx('text-sm font-medium', isDone ? 'text-faint line-through' : 'text-ink')}>
                {task.title}
              </p>
              {context && (
                <p className="truncate text-xs text-muted">
                  {showLinks && task.candidate_id ? (
                    <Link href={`/candidates/${task.candidate_id}`} className="hover:text-brand">
                      {context}
                    </Link>
                  ) : (
                    context
                  )}
                </p>
              )}
              {task.details && <p className="mt-0.5 truncate text-xs text-faint">{task.details}</p>}
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1">
              {task.priority !== 'normal' && (
                <Badge tone={PRIORITY_TONE[task.priority]}>{labelOf(TASK_PRIORITIES, task.priority)}</Badge>
              )}
              {task.due_at && (
                <span className={cx('text-xs', task.is_overdue ? 'font-medium text-danger' : 'text-faint')}>
                  {relativeTime(task.due_at)}
                </span>
              )}
              {task.created_by === 'automation' && <span className="text-[10px] text-faint">אוטומציה</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
