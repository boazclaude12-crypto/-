'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Input, Select, Spinner, cx } from '../ui';
import { Icon } from '../ui/icons';

export interface FilterDefinition {
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
}

/**
 * URL-driven filters: state lives in the query string, so every filtered view is
 * shareable, survives a refresh, and the server component stays the single source of data.
 */
export function FilterBar({
  searchPlaceholder = 'חיפוש…',
  filters = [],
  extra,
}: {
  searchPlaceholder?: string;
  filters?: FilterDefinition[];
  extra?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(params.get('q') ?? '');

  useEffect(() => {
    setQuery(params.get('q') ?? '');
  }, [params]);

  function apply(next: URLSearchParams) {
    startTransition(() => {
      const search = next.toString();
      router.replace(search ? `${pathname}?${search}` : pathname);
    });
  }

  useEffect(() => {
    const current = params.get('q') ?? '';
    if (query === current) return;
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (query.trim()) next.set('q', query.trim());
      else next.delete('q');
      apply(next);
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    apply(next);
  }

  const activeCount = filters.filter((filter) => params.get(filter.key)).length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[12rem] flex-1">
        <Icon.Search
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint"
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchPlaceholder}
          className="pr-9"
          aria-label="חיפוש"
        />
      </div>

      {filters.map((filter) => (
        <Select
          key={filter.key}
          className="w-auto min-w-[8.5rem]"
          options={filter.options}
          placeholder={filter.label}
          value={params.get(filter.key) ?? ''}
          onChange={(event) => setFilter(filter.key, event.target.value)}
          aria-label={filter.label}
        />
      ))}

      {activeCount > 0 && (
        <button
          onClick={() => apply(new URLSearchParams())}
          className="text-sm font-medium text-brand hover:underline"
        >
          ניקוי סינון
        </button>
      )}

      {pending && <Spinner className={cx('h-4 w-4 text-faint')} />}
      {extra}
    </div>
  );
}
