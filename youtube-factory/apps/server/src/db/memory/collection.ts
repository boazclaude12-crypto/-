import { newId } from '../../shared/ids.js';
import { NotFoundError } from '../../shared/errors.js';

/**
 * A tiny in-memory table. Deep-clones on read and write so callers cannot mutate stored
 * state by accident — the same isolation a real database gives you.
 */
export class Collection<T extends { id: string }> {
  private readonly rows = new Map<string, T>();

  constructor(private readonly name: string) {}

  insert(row: Omit<T, 'id'> & { id?: string }): T {
    const id = row.id ?? newId();
    const stored = { ...(row as object), id } as T;
    this.rows.set(id, clone(stored));
    return clone(stored);
  }

  get(id: string): T | null {
    const row = this.rows.get(id);
    return row ? clone(row) : null;
  }

  require(id: string): T {
    const row = this.get(id);
    if (!row) throw new NotFoundError(this.name);
    return row;
  }

  update(id: string, patch: Partial<T>): T {
    const existing = this.rows.get(id);
    if (!existing) throw new NotFoundError(this.name);
    const next = { ...existing, ...stripUndefined(patch), id } as T;
    this.rows.set(id, clone(next));
    return clone(next);
  }

  upsertBy(predicate: (row: T) => boolean, factory: () => Omit<T, 'id'> & { id?: string }, patch: Partial<T>): T {
    const found = this.find(predicate);
    if (found) return this.update(found.id, patch);
    return this.insert({ ...factory(), ...stripUndefined(patch) } as Omit<T, 'id'> & { id?: string });
  }

  delete(id: string): void {
    this.rows.delete(id);
  }

  deleteWhere(predicate: (row: T) => boolean): number {
    let n = 0;
    for (const [id, row] of this.rows) {
      if (predicate(row)) {
        this.rows.delete(id);
        n += 1;
      }
    }
    return n;
  }

  find(predicate: (row: T) => boolean): T | null {
    for (const row of this.rows.values()) if (predicate(row)) return clone(row);
    return null;
  }

  filter(predicate: (row: T) => boolean = () => true): T[] {
    const out: T[] = [];
    for (const row of this.rows.values()) if (predicate(row)) out.push(clone(row));
    return out;
  }

  all(): T[] {
    return this.filter();
  }

  get size(): number {
    return this.rows.size;
  }

  clear(): void {
    this.rows.clear();
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function stripUndefined<T extends object>(patch: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) out[k] = v;
  return out as Partial<T>;
}

export function sortBy<T>(items: T[], key: (item: T) => number | string, direction: 'asc' | 'desc' = 'asc'): T[] {
  const factor = direction === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === kb) return 0;
    return ka < kb ? -factor : factor;
  });
}
