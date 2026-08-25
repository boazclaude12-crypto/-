'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Spinner, cx } from '../ui';
import { Icon } from '../ui/icons';
import { api, errorMessage } from '@/lib/client/api';

interface Reference {
  kind: 'candidate' | 'job' | 'client';
  id: string;
  label: string;
}

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  references?: Reference[];
  provider?: string;
}

const HREF: Record<Reference['kind'], (id: string) => string> = {
  candidate: (id) => `/candidates/${id}`,
  job: (id) => `/jobs/${id}`,
  client: (id) => `/clients/${id}`,
};

const KIND_LABEL: Record<Reference['kind'], string> = {
  candidate: 'מועמד',
  job: 'משרה',
  client: 'לקוח',
};

/**
 * Chat over the recruiter's own data. Retrieval happens server-side and always
 * scoped to their organisation; the answer links back to the records it used, so
 * every claim is checkable.
 */
export function AssistantChat({ suggestions, providerName }: { suggestions: string[]; providerName: string }) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, busy]);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || busy) return;

    const history = turns.slice(-8).map((turn) => ({ role: turn.role, content: turn.content }));
    setTurns((current) => [...current, { role: 'user', content: trimmed }]);
    setInput('');
    setBusy(true);
    setError(null);

    try {
      const reply = await api.post<{ answer: string; references: Reference[]; provider: string }>('/api/chat', {
        message: trimmed,
        history,
      });
      setTurns((current) => [
        ...current,
        { role: 'assistant', content: reply.answer, references: reply.references, provider: reply.provider },
      ]);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-11rem)] flex-col rounded-xl border border-line bg-surface">
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Icon.Sparkles size={16} className="text-brand" />
          עוזר הגיוס
        </span>
        <Badge tone={providerName === 'anthropic' ? 'brand' : 'slate'}>
          {providerName === 'anthropic' ? 'Claude מחובר' : 'מנוע מקומי'}
        </Badge>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {turns.length === 0 && (
          <div className="mx-auto max-w-md py-6 text-center">
            <p className="text-sm font-medium text-ink">שאל אותי כל דבר על הגיוס שלך</p>
            <p className="mt-1 text-sm text-muted">
              אני עונה רק על סמך הנתונים שבמערכת שלך — לא ממציא מועמדים או מספרים.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => ask(suggestion)}
                  className="rounded-lg border border-line px-3 py-2 text-right text-sm text-muted transition hover:border-brand/50 hover:bg-brand-soft hover:text-brand"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn, index) => (
          <div
            key={index}
            className={cx('flex', turn.role === 'user' ? 'justify-start' : 'justify-end')}
          >
            <div
              className={cx(
                'max-w-[85%] rounded-xl px-3.5 py-2.5',
                turn.role === 'user' ? 'bg-brand text-brand-ink' : 'border border-line bg-bg',
              )}
            >
              <p className={cx('whitespace-pre-wrap text-sm', turn.role === 'user' ? '' : 'text-ink')}>
                {turn.content}
              </p>
              {turn.references && turn.references.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 border-t border-line/60 pt-2">
                  {turn.references.map((reference) => (
                    <Link
                      key={`${reference.kind}-${reference.id}`}
                      href={HREF[reference.kind](reference.id)}
                      className="inline-flex items-center gap-1 rounded-md bg-surface px-2 py-0.5 text-xs text-brand hover:underline"
                    >
                      {reference.label}
                      <span className="text-faint">· {KIND_LABEL[reference.kind]}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-end">
            <div className="flex items-center gap-2 rounded-xl border border-line bg-bg px-3.5 py-2.5 text-sm text-muted">
              <Spinner className="h-4 w-4" /> בודק בנתונים שלך…
            </div>
          </div>
        )}

        {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          ask(input);
        }}
        className="flex gap-2 border-t border-line p-3"
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="לדוגמה: מי מתאים למשרת נהג בחיפה?"
          className="h-10 flex-1 rounded-lg border border-line bg-bg px-3 text-sm text-ink placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
          aria-label="שאלה לעוזר"
        />
        <Button type="submit" loading={busy} disabled={!input.trim()}>
          שליחה
        </Button>
      </form>
    </div>
  );
}
