/**
 * Narration timing (spec §13). Speaking rate is language-dependent, so the mapping from a
 * target runtime to a word budget is data, not a magic constant.
 */
export const WORDS_PER_MINUTE: Record<string, number> = {
  en: 145,
  he: 120,
  es: 155,
  pt: 155,
  fr: 150,
  de: 135,
  it: 155,
  ru: 130,
  ar: 125,
  hi: 130,
  ja: 300, // characters/min — Japanese is counted in characters below
  zh: 260,
  ko: 260,
};

const CHARACTER_LANGUAGES = new Set(['ja', 'zh', 'ko']);

export function wordsPerMinute(language: string): number {
  return WORDS_PER_MINUTE[language.slice(0, 2).toLowerCase()] ?? 145;
}

export function countWords(text: string, language = 'en'): number {
  if (CHARACTER_LANGUAGES.has(language.slice(0, 2).toLowerCase())) {
    return [...text.replace(/\s+/g, '')].length;
  }
  const matches = text.trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return matches ? matches.length : 0;
}

/** Expected narration seconds for a body of text. */
export function estimateDurationSec(text: string, language = 'en'): number {
  const words = countWords(text, language);
  return (words / wordsPerMinute(language)) * 60;
}

/** Word budget for a target runtime — the number the script agent is held to. */
export function wordBudget(targetSeconds: number, language = 'en'): { min: number; target: number; max: number } {
  const target = Math.round((targetSeconds / 60) * wordsPerMinute(language));
  return { min: Math.round(target * 0.85), target, max: Math.round(target * 1.15) };
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Shingle-based overlap used by the originality check (spec §53): what fraction of the
 * script's n-grams also appear verbatim in a source document?
 */
export function ngramOverlap(a: string, b: string, n = 8): number {
  const left = shingles(a, n);
  if (left.size === 0) return 0;
  const right = shingles(b, n);
  let hits = 0;
  for (const s of left) if (right.has(s)) hits += 1;
  return hits / left.size;
}

function shingles(text: string, n: number): Set<string> {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const out = new Set<string>();
  for (let i = 0; i + n <= words.length; i += 1) out.add(words.slice(i, i + n).join(' '));
  return out;
}

/** Split narration into sentence-sized chunks for scene assignment and TTS segments. */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…。！？])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Group sentences into chunks that stay under `maxChars` without breaking a sentence. */
export function chunkText(text: string, maxChars: number): string[] {
  const sentences = splitSentences(text);
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && current.length + sentence.length + 1 > maxChars) {
      chunks.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [text];
}
