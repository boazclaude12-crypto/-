'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '../ui/icons';
import { cx, Spinner } from '../ui';
import { api } from '@/lib/client/api';

interface SearchHit {
  kind: 'candidate' | 'job' | 'client' | 'tag';
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

const KIND_META: Record<SearchHit['kind'], { label: string; icon: typeof Icon.Users }> = {
  candidate: { label: 'מועמד', icon: Icon.Users },
  job: { label: 'משרה', icon: Icon.Briefcase },
  client: { label: 'לקוח', icon: Icon.Building },
  tag: { label: 'תגית', icon: Icon.Star },
};

const NAVIGATION = [
  { label: 'ראשי', href: '/dashboard' },
  { label: 'מועמדים', href: '/candidates' },
  { label: 'משרות', href: '/jobs' },
  { label: 'לקוחות', href: '/clients' },
  { label: 'פייפליין', href: '/pipeline' },
  { label: 'משימות', href: '/tasks' },
  { label: 'כספים', href: '/money' },
  { label: 'נתונים', href: '/analytics' },
  { label: 'עוזר AI', href: '/assistant' },
  { label: 'אוטומציות', href: '/automations' },
  { label: 'הגדרות', href: '/settings' },
];

/**
 * ⌘K palette: searches candidates, jobs, clients and tags server-side (debounced),
 * and doubles as a launcher for navigation and the create actions.
 */
export function CommandMenu({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (kind: 'candidate' | 'job' | 'client' | 'task') => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [interpretation, setInterpretation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setHits([]);
      setCursor(0);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setHits([]);
      setInterpretation(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const result = await api.get<{ hits: SearchHit[]; interpretation: string | null }>(
          `/api/search?q=${encodeURIComponent(trimmed)}`,
        );
        if (!cancelled) {
          setHits(result.hits);
          setInterpretation(result.interpretation);
          setCursor(0);
        }
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open]);

  const navigationMatches = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return NAVIGATION.slice(0, 6);
    return NAVIGATION.filter((item) => item.label.includes(trimmed)).slice(0, 4);
  }, [query]);

  const createActions = useMemo(
    () =>
      [
        { key: 'candidate' as const, label: 'מועמד חדש' },
        { key: 'job' as const, label: 'משרה חדשה' },
        { key: 'client' as const, label: 'לקוח חדש' },
        { key: 'task' as const, label: 'משימה חדשה' },
      ].filter((item) => !query.trim() || item.label.includes(query.trim())),
    [query],
  );

  type Row =
    | { type: 'hit'; hit: SearchHit }
    | { type: 'nav'; href: string; label: string }
    | { type: 'create'; kind: 'candidate' | 'job' | 'client' | 'task'; label: string };

  const rows: Row[] = [
    ...hits.map((hit) => ({ type: 'hit' as const, hit })),
    ...navigationMatches.map((item) => ({ type: 'nav' as const, href: item.href, label: item.label })),
    ...createActions.map((item) => ({ type: 'create' as const, kind: item.key, label: item.label })),
  ];

  function run(row: Row) {
    onClose();
    if (row.type === 'hit') router.push(row.hit.href);
    else if (row.type === 'nav') router.push(row.href);
    else onCreate(row.kind);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') return onClose();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((value) => Math.min(value + 1, rows.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((value) => Math.max(value - 1, 0));
    } else if (event.key === 'Enter' && rows[cursor]) {
      event.preventDefault();
      run(rows[cursor]!);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-center bg-black/45 p-4 pt-[10vh]">
      <button className="absolute inset-0" onClick={onClose} aria-label="סגירה" tabIndex={-1} />
      <div
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-pop"
        role="dialog"
        aria-label="חיפוש מהיר"
      >
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Icon.Search size={18} className="text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder='חיפוש… לדוגמה: "C חיפה" או שם מועמד'
            className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
            aria-label="שדה חיפוש"
          />
          {loading && <Spinner className="h-4 w-4 text-faint" />}
        </div>

        {interpretation && (
          <p className="border-b border-line bg-brand-soft px-4 py-1.5 text-xs text-brand">{interpretation}</p>
        )}

        <div className="max-h-[52vh] overflow-y-auto py-1">
          {rows.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-faint">
              {query.trim().length < 2 ? 'הקלד לפחות שני תווים' : 'לא נמצאו תוצאות'}
            </p>
          )}
          {rows.map((row, index) => {
            const active = index === cursor;
            if (row.type === 'hit') {
              const meta = KIND_META[row.hit.kind];
              const HitIcon = meta.icon;
              return (
                <button
                  key={`hit-${row.hit.kind}-${row.hit.id}`}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => run(row)}
                  className={cx(
                    'flex w-full items-center gap-3 px-4 py-2.5 text-right transition',
                    active ? 'bg-brand-soft' : 'hover:bg-line/30',
                  )}
                >
                  <HitIcon size={16} className="text-faint" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{row.hit.title}</span>
                    <span className="block truncate text-xs text-faint">{row.hit.subtitle}</span>
                  </span>
                  <span className="text-[10px] text-faint">{meta.label}</span>
                </button>
              );
            }
            return (
              <button
                key={`${row.type}-${row.type === 'nav' ? row.href : row.kind}`}
                onMouseEnter={() => setCursor(index)}
                onClick={() => run(row)}
                className={cx(
                  'flex w-full items-center gap-3 px-4 py-2.5 text-right transition',
                  active ? 'bg-brand-soft' : 'hover:bg-line/30',
                )}
              >
                {row.type === 'create' ? (
                  <Icon.Plus size={16} className="text-faint" />
                ) : (
                  <Icon.ArrowLeft size={16} className="text-faint" />
                )}
                <span className="flex-1 text-sm text-ink">{row.label}</span>
                <span className="text-[10px] text-faint">{row.type === 'create' ? 'יצירה' : 'מעבר'}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
