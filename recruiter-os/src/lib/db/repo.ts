import { getDb, type Db, type Param, type Row } from './index';
import { newId } from '../ids';
import { nowIso } from '../time';

const columnCache = new Map<string, Set<string>>();

/** Column list for a table, cached per process. Also acts as a write allow-list. */
export function tableColumns(table: string, db: Db = getDb()): Set<string> {
  const cached = columnCache.get(table);
  if (cached) return cached;
  const rows = db.all<{ name: string }>(`PRAGMA table_info(${table})`);
  if (rows.length === 0) throw new Error(`Unknown table: ${table}`);
  const set = new Set(rows.map((r) => r.name));
  columnCache.set(table, set);
  return set;
}

export type Values = Record<string, Param | boolean | undefined>;

function coerce(value: Param | boolean | undefined): Param {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

export interface ListOptions {
  where?: string;
  params?: Param[];
  orderBy?: string;
  limit?: number;
  offset?: number;
  columns?: string;
}

/**
 * CRUD for one table, with `org_id` forced into every statement.
 *
 * Scoping lives here rather than in call sites so a forgotten `WHERE org_id = ?`
 * cannot leak one recruiter's candidates into another's account.
 */
export function createRepository<T = Row>(table: string, idPrefix: string) {
  const db = () => getDb();

  function writable(values: Values): [string[], Param[]] {
    const columns = tableColumns(table, db());
    const keys: string[] = [];
    const params: Param[] = [];
    for (const [key, value] of Object.entries(values)) {
      if (key === 'id' || key === 'org_id' || !columns.has(key)) continue;
      keys.push(key);
      params.push(coerce(value));
    }
    return [keys, params];
  }

  return {
    table,

    create(orgId: string, values: Values, id = newId(idPrefix)): T {
      const columns = tableColumns(table, db());
      const [keys, params] = writable(values);
      const allKeys = ['id', 'org_id', ...keys];
      const allParams: Param[] = [id, orgId, ...params];
      if (columns.has('created_at') && !keys.includes('created_at')) {
        allKeys.push('created_at');
        allParams.push(nowIso());
      }
      if (columns.has('updated_at') && !keys.includes('updated_at')) {
        allKeys.push('updated_at');
        allParams.push(nowIso());
      }
      db().run(
        `INSERT INTO ${table} (${allKeys.join(', ')}) VALUES (${allKeys.map(() => '?').join(', ')})`,
        ...allParams,
      );
      return this.find(orgId, id) as T;
    },

    update(orgId: string, id: string, values: Values): T | undefined {
      const columns = tableColumns(table, db());
      const [keys, params] = writable(values);
      if (keys.length === 0) return this.find(orgId, id);
      const sets = keys.map((k) => `${k} = ?`);
      if (columns.has('updated_at') && !keys.includes('updated_at')) {
        sets.push('updated_at = ?');
        params.push(nowIso());
      }
      db().run(
        `UPDATE ${table} SET ${sets.join(', ')} WHERE id = ? AND org_id = ?`,
        ...params,
        id,
        orgId,
      );
      return this.find(orgId, id);
    },

    find(orgId: string, id: string): T | undefined {
      return db().get<T>(`SELECT * FROM ${table} WHERE id = ? AND org_id = ?`, id, orgId);
    },

    findBy(orgId: string, where: string, ...params: Param[]): T | undefined {
      return db().get<T>(`SELECT * FROM ${table} WHERE org_id = ? AND ${where}`, orgId, ...params);
    },

    list(orgId: string, options: ListOptions = {}): T[] {
      const { where, params = [], orderBy, limit, offset, columns = '*' } = options;
      let sql = `SELECT ${columns} FROM ${table} WHERE org_id = ?`;
      if (where) sql += ` AND (${where})`;
      if (orderBy) sql += ` ORDER BY ${orderBy}`;
      if (limit !== undefined) sql += ` LIMIT ${Number(limit)}`;
      if (offset !== undefined) sql += ` OFFSET ${Number(offset)}`;
      return db().all<T>(sql, orgId, ...params);
    },

    count(orgId: string, where?: string, params: Param[] = []): number {
      let sql = `SELECT COUNT(*) AS n FROM ${table} WHERE org_id = ?`;
      if (where) sql += ` AND (${where})`;
      const row = db().get<{ n: number }>(sql, orgId, ...params);
      return Number(row?.n ?? 0);
    },

    remove(orgId: string, id: string): boolean {
      return db().run(`DELETE FROM ${table} WHERE id = ? AND org_id = ?`, id, orgId).changes > 0;
    },

    removeBy(orgId: string, where: string, ...params: Param[]): number {
      return db().run(`DELETE FROM ${table} WHERE org_id = ? AND ${where}`, orgId, ...params).changes;
    },
  };
}

export type Repository<T = Row> = ReturnType<typeof createRepository<T>>;
