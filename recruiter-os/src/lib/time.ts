/** All timestamps are stored as ISO-8601 UTC strings. */
export function nowIso(): string {
  return new Date().toISOString();
}

export function isoPlus(ms: number, from: Date | string = new Date()): string {
  const base = typeof from === 'string' ? new Date(from) : from;
  return new Date(base.getTime() + ms).toISOString();
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function daysBetween(a: string | Date, b: string | Date = new Date()): number {
  const start = typeof a === 'string' ? new Date(a) : a;
  const end = typeof b === 'string' ? new Date(b) : b;
  return Math.floor((end.getTime() - start.getTime()) / DAY);
}

export function hoursBetween(a: string | Date, b: string | Date = new Date()): number {
  const start = typeof a === 'string' ? new Date(a) : a;
  const end = typeof b === 'string' ? new Date(b) : b;
  return Math.floor((end.getTime() - start.getTime()) / HOUR);
}

/** Start of local day, returned as an ISO string. */
export function startOfDay(date: Date = new Date()): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function endOfDay(date: Date = new Date()): string {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

export function startOfMonth(date: Date = new Date()): string {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
}

export function endOfMonth(date: Date = new Date()): string {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
}

export function addDays(days: number, from: Date | string = new Date()): string {
  return isoPlus(days * DAY, from);
}

export function dateOnly(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toISOString().slice(0, 10);
}
