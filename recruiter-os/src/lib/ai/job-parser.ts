import { lookupPlace, regionOfCity } from '../geo';
import { canonical } from '../text';
import {
  CERTIFICATION_KEYWORDS, LANGUAGE_KEYWORDS, LICENSE_PATTERNS, SKILL_KEYWORDS,
} from './cv-parser';

export interface ParsedRequirement {
  kind: 'license' | 'certification' | 'skill' | 'experience' | 'education' | 'language' | 'other';
  value: string;
  is_required: boolean;
}

export interface ParsedJob {
  title: string | null;
  city: string | null;
  region: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: 'month' | 'hour' | 'year';
  employment_type: string | null;
  work_mode: 'onsite' | 'hybrid' | 'remote';
  hours: string | null;
  requirements: ParsedRequirement[];
  description: string;
  /** Fields the text did not contain, so the form can point at them. */
  missing: string[];
  confidence: number;
}

/** Headers that open a list of requirements, and whether that list is mandatory. */
const REQUIREMENT_HEADERS: Array<{ re: RegExp; required: boolean }> = [
  { re: /^\s*(דרישות\s*(ה?תפקיד|חובה)?|תנאי\s*סף|מה\s*אנחנו\s*מחפשים|requirements)\s*:?\s*$/i, required: true },
  { re: /^\s*(חובה)\s*:?\s*$/i, required: true },
  { re: /^\s*(יתרון|יתרונות|נוסף|advantage|nice\s*to\s*have)\s*:?\s*$/i, required: false },
];

const SECTION_END = /^\s*(תיאור\s*ה?תפקיד|תנאים|הטבות|על\s*ה?חברה|היקף|שעות|מיקום|שכר|לפרטים|קו"ח|קורות\s*חיים)\s*:?/i;

/** Marks that make one line mandatory or optional regardless of the section it sits in. */
const REQUIRED_MARK = /[-–—(\s]\s*חובה\s*[)!.]?\s*$|^\s*חובה\s*[-–—:]/;
const OPTIONAL_MARK = /[-–—(\s]\s*יתרון\s*[)!.]?\s*$|^\s*יתרון\s*[-–—:]/;

const BULLET = /^[\s]*[-–—•*·✔✓●○▪◦📌🔹🔸]+\s*/;

function clean(line: string): string {
  return line
    .replace(BULLET, '')
    .replace(REQUIRED_MARK, '')
    .replace(OPTIONAL_MARK, '')
    .replace(/[\s:,.;־-]+$/, '')
    .trim();
}

/**
 * Decides which kind of requirement a line states.
 *
 * Uses the same vocabulary the CV parser uses for candidate attributes. Both sides of a
 * match have to agree on what counts as a licence or a skill, or a requirement can never
 * be met by the very attribute that satisfies it.
 */
function classify(line: string): ParsedRequirement['kind'] {
  if (LICENSE_PATTERNS.some(({ re }) => re.test(line))) return 'license';
  if (/\d+\s*(שנות|שנים|שנה)\s*ניסיון|ניסיון\s*(של\s*)?\d+/.test(line)) return 'experience';
  if (/ניסיון/.test(line)) return 'experience';
  if (/תואר|בגרות|תיכונית|השכלה|הנדסאי|לימודי/.test(line)) return 'education';
  if (LANGUAGE_KEYWORDS.some((word) => line.includes(word))) return 'language';
  if (CERTIFICATION_KEYWORDS.some((word) => canonical(line).includes(canonical(word)))) return 'certification';
  if (SKILL_KEYWORDS.some((word) => canonical(line).includes(canonical(word)))) return 'skill';
  return 'other';
}

/** Normalises a licence line to the same label the CV parser produces. */
function normaliseValue(line: string, kind: ParsedRequirement['kind']): string {
  if (kind === 'license') {
    const match = LICENSE_PATTERNS.find(({ re }) => re.test(line));
    if (match) return match.label;
  }
  return line;
}

function parseSalary(text: string): { min: number | null; max: number | null; period: 'month' | 'hour' | 'year' } {
  const hourly = /(\d{2,3})(?:\s*[-–—]\s*(\d{2,3}))?\s*(?:₪|ש"ח|שח|שקל)\s*(?:ל|ב)?שעה|שכר\s*שעתי[^\d]{0,12}(\d{2,3})/i.exec(text);
  if (hourly) {
    const min = Number(hourly[1] ?? hourly[3]);
    return { min, max: hourly[2] ? Number(hourly[2]) : null, period: 'hour' };
  }
  const monthly = /(\d{1,2}[,.]?\d{3})\s*(?:[-–—]\s*(\d{1,2}[,.]?\d{3}))?\s*(?:₪|ש"ח|שח|שקל)/.exec(text);
  if (monthly) {
    const toNumber = (value: string) => Number(value.replace(/[,.]/g, ''));
    return { min: toNumber(monthly[1]!), max: monthly[2] ? toNumber(monthly[2]) : null, period: 'month' };
  }
  return { min: null, max: null, period: 'month' };
}

/**
 * Finds the town the job is in.
 *
 * Scanned windowed against the gazetteer because Hebrew attaches the preposition to the
 * name — "באשקלון" is one token, and a plain lookup would miss every one of them.
 */
function parseCity(text: string): string | null {
  const tokens = text.split(/[\s,|()״"']+/).filter(Boolean);
  for (const token of tokens) {
    const bare = token.replace(/^[בהלמו]/, '');
    const place = lookupPlace(token) ?? lookupPlace(bare);
    if (place) return place.city;
  }
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const pair = `${tokens[i]} ${tokens[i + 1]}`;
    const place = lookupPlace(pair) ?? lookupPlace(pair.replace(/^[בהלמו]/, ''));
    if (place) return place.city;
  }
  return null;
}

/**
 * Turns a job description into a job record with structured requirements.
 *
 * This is how openings actually arrive on a freelance desk — as a paragraph in an email
 * or a WhatsApp message from the client — and structured requirements are what the
 * matching engine scores against. Asked to retype them one at a time into a form, nobody
 * does, and the matching quietly falls back to scoring everyone the same. Reading them
 * out of the text the recruiter already has is what keeps the match honest.
 *
 * Whether a requirement is mandatory is taken from the words the post uses — a line
 * marked יתרון is not a blocker, and one under דרישות חובה is — because that distinction
 * decides whether a candidate is capped or merely deducted.
 */
export function parseJobText(text: string): ParsedJob {
  const rawLines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const flat = text.replace(/\s+/g, ' ');

  // Title: the first line that reads like a heading rather than a sentence.
  const title = (() => {
    for (const line of rawLines.slice(0, 4)) {
      const candidate = clean(line);
      if (candidate.length >= 2 && candidate.length <= 80 && !/[.!?]$/.test(candidate)) {
        // "דרוש/ה מחסנאי לחיפה" → "מחסנאי"
        const wanted = candidate.match(/^(?:דרוש(?:ים|ות|\/ה)?|מחפשים|מגייסים)\s+(.+?)(?:\s+(?:ל|ב)[א-ת].*)?$/);
        return (wanted?.[1] ?? candidate).replace(/\s*[-–—]\s*.*$/, '').trim() || null;
      }
    }
    return null;
  })();

  const city = parseCity(flat);
  const salary = parseSalary(flat);

  const employment_type =
    /משמרת|משמרות/.test(flat) ? 'shifts'
    : /חלקית|חצי\s*משרה|פארט\s*טיים/.test(flat) ? 'part_time'
    : /זמני|החלפה\s*ל|תקופת/.test(flat) ? 'temp'
    : /פרילנס|freelance|קבלן/.test(flat) ? 'freelance'
    : /מלאה|full\s*time/.test(flat) ? 'full_time'
    : null;

  const work_mode: ParsedJob['work_mode'] =
    /100%\s*מרחוק|עבודה\s*מרחוק|remote/i.test(flat) ? 'remote'
    : /היברידי|hybrid|יומיים\s*מהבית|משולב/i.test(flat) ? 'hybrid'
    : 'onsite';

  const hours = flat.match(/\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}/)?.[0] ?? null;

  // Requirements: everything under a requirements header, until the section closes.
  const requirements: ParsedRequirement[] = [];
  const seen = new Set<string>();
  let sectionRequired: boolean | null = null;

  for (const raw of rawLines) {
    const header = REQUIREMENT_HEADERS.find(({ re }) => re.test(raw.replace(BULLET, '')));
    if (header) {
      sectionRequired = header.required;
      continue;
    }
    if (SECTION_END.test(raw)) {
      sectionRequired = null;
      continue;
    }

    const markedRequired = REQUIRED_MARK.test(raw);
    const markedOptional = OPTIONAL_MARK.test(raw);
    if (sectionRequired === null && !markedRequired && !markedOptional) continue;

    const value = clean(raw);
    if (value.length < 2 || value.length > 120) continue;
    const key = canonical(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const kind = classify(value);
    requirements.push({
      kind,
      value: normaliseValue(value, kind),
      // An explicit mark on the line beats the section it happens to sit under.
      is_required: markedRequired ? true : markedOptional ? false : sectionRequired === true,
    });
    if (requirements.length >= 20) break;
  }

  const missing: string[] = [];
  if (!title) missing.push('שם המשרה');
  if (!city) missing.push('עיר');
  if (salary.min === null) missing.push('שכר');
  if (requirements.length === 0) missing.push('דרישות');

  const filled = 4 - missing.length;
  return {
    title,
    city,
    region: city ? regionOfCity(city) : null,
    salary_min: salary.min,
    salary_max: salary.max,
    salary_period: salary.period,
    employment_type,
    work_mode,
    hours,
    requirements,
    description: text.trim().slice(0, 6000),
    missing,
    confidence: Math.round((filled / 4) * 100),
  };
}
