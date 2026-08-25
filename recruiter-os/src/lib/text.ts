const NIQQUD = /[֑-ׇ]/g;
const PUNCT = /[.,/#!$%^&*;:{}=\-_`~()\[\]"'?<>|\\+]/g;

/** Lower-cases, strips Hebrew niqqud and punctuation, collapses whitespace. */
export function normalize(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFKC')
    .replace(NIQQUD, '')
    .replace(PUNCT, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function tokenize(value: string | null | undefined): string[] {
  const normalized = normalize(value);
  if (!normalized) return [];
  return normalized.split(' ').filter((t) => t.length > 0);
}

/**
 * Recruiters type the same requirement many ways ("רישיון C", "נהג ג'", "כיתה C").
 * Canonicalising before comparison is what makes matching and search actually hit.
 */
const SYNONYMS: Array<[RegExp, string]> = [
  [/^(רישיון|רשיון|רי?שיון נהיגה|כיתה|דרגה)\s*/, ''],
  [/^נהג\s+(?=[a-zא-ת]{1,2}$)/, ''],
  [/^ג'?$/, 'c'],
  [/^ג'?\s*ה'?$/, 'ce'],
  [/^ד'?$/, 'd'],
  [/^ב'?$/, 'b'],
  [/^א'?$/, 'a'],
];

const EQUIVALENTS: Record<string, string> = {
  'מלגזה': 'מלגזן',
  'מפעיל מלגזה': 'מלגזן',
  'נהג מלגזה': 'מלגזן',
  'מחסן': 'מחסנאי',
  'עובד מחסן': 'מחסנאי',
  'ליקוט': 'מלקט',
  'עגורן': 'מנופאי',
  'מנוף': 'מנופאי',
  'משאית': 'נהג משאית',
  'חלוקה': 'נהג חלוקה',
  'forklift': 'מלגזן',
  'warehouse': 'מחסנאי',
  'driver': 'נהג',
};

export function canonical(value: string | null | undefined): string {
  let out = normalize(value);
  if (!out) return '';
  for (const [pattern, replacement] of SYNONYMS) out = out.replace(pattern, replacement).trim();
  if (EQUIVALENTS[out]) out = EQUIVALENTS[out];
  return out;
}

/** True when two free-text values mean the same requirement. */
export function sameTerm(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = canonical(a);
  const cb = canonical(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  // "נהג חלוקה" satisfies a "נהג" requirement, but not the other way round.
  return ca.split(' ').includes(cb) || cb.split(' ').includes(ca);
}

/** Whether `haystack` mentions `term` — used for matching against CV free text. */
export function mentions(haystack: string | null | undefined, term: string | null | undefined): boolean {
  const hay = ` ${normalize(haystack)} `;
  const needle = normalize(term);
  if (!hay.trim() || !needle) return false;
  return hay.includes(` ${needle} `) || hay.includes(needle);
}

/** 0..1 token-overlap similarity, used to rank free-text search results. */
export function similarity(a: string, b: string): number {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let shared = 0;
  for (const token of tokensA) if (tokensB.has(token)) shared += 1;
  return shared / Math.max(tokensA.size, tokensB.size);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0] ?? '').join('') || '?';
}

/** Israeli numbers are stored E.164-ish so WhatsApp links and dedupe both work. */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.startsWith('0')) return `+972${digits.slice(1)}`;
  if (digits.startsWith('972')) return `+${digits}`;
  return digits;
}

export function displayPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const normalized = normalizePhone(raw);
  if (normalized.startsWith('+972')) {
    const local = `0${normalized.slice(4)}`;
    return local.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');
  }
  return raw;
}
