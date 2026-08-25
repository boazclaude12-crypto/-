import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export type Row = Record<string, unknown>;
export type Param = string | number | bigint | null | Uint8Array;

const DEFAULT_DB_FILE = './data/recruiter.db';

/**
 * Thin synchronous wrapper over the SQLite driver.
 *
 * Everything above this file talks to `Db`, never to the driver directly, so the
 * storage engine can be swapped (e.g. for Postgres) by providing another implementation
 * of this interface plus a dialect-specific set of migrations.
 */
export interface Db {
  all<T = Row>(sql: string, ...params: Param[]): T[];
  get<T = Row>(sql: string, ...params: Param[]): T | undefined;
  run(sql: string, ...params: Param[]): { changes: number };
  exec(sql: string): void;
  transaction<T>(fn: () => T): T;
  close(): void;
}

/**
 * The driver returns rows with a null prototype. React Server Components refuse to
 * serialise those to Client Components, so rows are normalised to plain objects here —
 * once, at the boundary — rather than at every call site.
 */
function toPlainObject(row: Row): Row {
  return { ...row };
}

class SqliteDb implements Db {
  #db: DatabaseSync;
  #depth = 0;

  constructor(file: string) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    this.#db = new DatabaseSync(file);
    this.#db.exec('PRAGMA journal_mode = WAL');
    this.#db.exec('PRAGMA foreign_keys = ON');
    this.#db.exec('PRAGMA busy_timeout = 5000');
  }

  all<T = Row>(sql: string, ...params: Param[]): T[] {
    return (this.#db.prepare(sql).all(...params) as Row[]).map(toPlainObject) as T[];
  }

  get<T = Row>(sql: string, ...params: Param[]): T | undefined {
    const row = this.#db.prepare(sql).get(...params) as Row | undefined;
    return row === undefined ? undefined : (toPlainObject(row) as T);
  }

  run(sql: string, ...params: Param[]) {
    const result = this.#db.prepare(sql).run(...params);
    return { changes: Number(result.changes) };
  }

  exec(sql: string) {
    this.#db.exec(sql);
  }

  /** Nesting-safe: inner calls join the outer transaction instead of failing. */
  transaction<T>(fn: () => T): T {
    if (this.#depth > 0) return fn();
    this.#depth += 1;
    this.#db.exec('BEGIN');
    try {
      const result = fn();
      this.#db.exec('COMMIT');
      return result;
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    } finally {
      this.#depth -= 1;
    }
  }

  close() {
    this.#db.close();
  }
}

export function createDb(file: string): Db {
  return new SqliteDb(file);
}

const MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name       TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`;

export function migrationsDir(): string {
  return path.resolve(process.cwd(), 'db/migrations');
}

/** Applies every unapplied .sql migration in filename order. Returns the ones applied. */
export function migrate(db: Db, dir = migrationsDir()): string[] {
  db.exec(MIGRATIONS_TABLE);
  const applied = new Set(
    db.all<{ name: string }>('SELECT name FROM schema_migrations').map((r) => r.name),
  );
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort() : [];
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.run('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)', file, new Date().toISOString());
    });
    ran.push(file);
  }
  return ran;
}

type GlobalWithDb = typeof globalThis & { __recruiterDb?: Db };

/**
 * Process-wide connection. Cached on globalThis so Next's dev-mode module reloading
 * does not open a new file handle on every request.
 */
export function getDb(): Db {
  const g = globalThis as GlobalWithDb;
  if (!g.__recruiterDb) {
    const file = process.env.DATABASE_FILE || DEFAULT_DB_FILE;
    const db = createDb(file);
    migrate(db);
    g.__recruiterDb = db;
  }
  return g.__recruiterDb;
}
