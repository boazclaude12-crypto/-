import { canonical, normalize, normalizePhone } from '../text';
import { lookupPlace, regionOfCity } from '../geo';

/**
 * Structured result of reading a CV. Every field is optional: when the document does
 * not state something, it stays empty. Nothing here is ever guessed or filled in
 * from a plausible-sounding default.
 */
export interface ParsedExperience {
  company: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  description: string | null;
}

export interface ParsedCv {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  region: string | null;
  current_role: string | null;
  years_experience: number | null;
  education: string | null;
  licenses: string[];
  /** Whether the CV says the person drives. Null when it says nothing either way. */
  has_car: boolean | null;
  certifications: string[];
  skills: string[];
  languages: string[];
  experiences: ParsedExperience[];
  /** Fields the document did not contain — surfaced in the UI so the user can fill them. */
  missing: string[];
  confidence: number;
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

/**
 * Car ownership decides how far a candidate can realistically travel, so it changes the
 * match score. CVs state it in a handful of stock phrases; anything else stays unknown
 * rather than being guessed at.
 */
const HAS_CAR_RE = /(רכב\s*(פרטי|צמוד|בבעלות)|בעל\s*רכב|בעלת\s*רכב|יש\s*רכב|רכב\s*זמין|ניידות\s*מלאה|own\s+(a\s+)?car|has\s+(a\s+)?car|own\s+vehicle)/i;
const NO_CAR_RE = /(אין\s*רכב|ללא\s*רכב|no\s+car|without\s+a\s+car)/i;

function detectCar(text: string): boolean | null {
  if (NO_CAR_RE.test(text)) return false;
  if (HAS_CAR_RE.test(text)) return true;
  return null;
}
const PHONE_RE = /(?:\+972[-\s]?|0)(?:5\d|[2-4]|[8-9]|7\d)[-\s]?\d{3}[-\s]?\d{4}/;

const SECTION_HEADERS: Record<string, RegExp> = {
  experience: /^(ניסיון(\s+תעסוקתי|\s+מקצועי)?|נסיון|תעסוקה|היסטוריה\s+תעסוקתית|work\s+experience|experience|employment)\s*:?\s*$/i,
  education: /^(השכלה|לימודים|education|academic)\s*:?\s*$/i,
  skills: /^(כישורים|מיומנויות|יכולות|skills|competencies)\s*:?\s*$/i,
  licenses: /^(רישיונות|רשיונות|licenses|licences)\s*:?\s*$/i,
  certifications: /^(הסמכות|תעודות|קורסים|certifications|courses)\s*:?\s*$/i,
  languages: /^(שפות|languages)\s*:?\s*$/i,
  personal: /^(פרטים\s+אישיים|about|profile|תמצית)\s*:?\s*$/i,
};

/** Driving licence classes as written in Israeli CVs. */
export const LICENSE_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /רישיון\s*(?:נהיגה\s*)?(?:דרגה\s*)?["']?\s*C\s*\+?\s*E\b/i, label: 'רישיון CE' },
  { re: /רישיון\s*(?:נהיגה\s*)?(?:דרגה\s*)?["']?\s*C1\b/i, label: 'רישיון C1' },
  { re: /רישיון\s*(?:נהיגה\s*)?(?:דרגה\s*)?["']?\s*C\b/i, label: 'רישיון C' },
  { re: /רישיון\s*(?:נהיגה\s*)?(?:דרגה\s*)?["']?\s*D\b/i, label: 'רישיון D' },
  { re: /רישיון\s*(?:נהיגה\s*)?(?:דרגה\s*)?["']?\s*B\b/i, label: 'רישיון B' },
  { re: /רישיון\s*(?:נהיגה\s*)?(?:כיתה\s*)?ג['׳]/, label: 'רישיון C' },
  { re: /רישיון\s*(?:נהיגה\s*)?(?:כיתה\s*)?ד['׳]/, label: 'רישיון D' },
  { re: /\bclass\s*C\+?E\b/i, label: 'רישיון CE' },
  { re: /\bclass\s*C\b/i, label: 'רישיון C' },
];

export const CERTIFICATION_KEYWORDS = [
  'מלגזה', 'מלגזן', 'עגורן', 'מנוף', 'עגורנאי', 'ריתוך', 'חשמלאי', 'ממונה בטיחות',
  'עזרה ראשונה', 'מפעיל ציוד', 'טרקטורון', 'שינוע חומרים מסוכנים', 'חומ"ס', 'רכב כבד',
  'מחסנאי מוסמך', 'הנדסאי', 'מאבטח', 'טכנאי',
];

export const SKILL_KEYWORDS = [
  'excel', 'אקסל', 'sap', 'priority', 'פריוריטי', 'ניהול צוות', 'שירות לקוחות', 'מכירות',
  'ליקוט', 'ניהול מלאי', 'קופה', 'נהיגה', 'מחשוב', 'office', 'crm', 'תפעול', 'לוגיסטיקה',
];

export const LANGUAGE_KEYWORDS = ['עברית', 'אנגלית', 'ערבית', 'רוסית', 'צרפתית', 'ספרדית', 'אמהרית'];

const NON_NAME_TOKENS = /(קורות|חיים|resume|cv|טלפון|נייד|מייל|email|כתובת|תאריך)/i;
const MONTH_RANGE_RE =
  /(\d{1,2}\/)?(\d{4})\s*[-–—עד]{1,3}\s*((\d{1,2}\/)?(\d{4})|היום|כיום|present|current|now)/i;

function lines(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter(Boolean);
}

function detectName(allLines: string[], email: string | null): { first: string | null; last: string | null } {
  const labelled = allLines.find((line) => /^(שם\s*(מלא)?|name)\s*[:：]/i.test(line));
  if (labelled) {
    const value = labelled.split(/[:：]/).slice(1).join(':').trim();
    const parts = value.split(/\s+/).filter(Boolean);
    if (parts.length) return { first: parts[0]!, last: parts.slice(1).join(' ') || null };
  }

  for (const line of allLines.slice(0, 8)) {
    if (NON_NAME_TOKENS.test(line)) continue;
    if (EMAIL_RE.test(line) || PHONE_RE.test(line)) continue;
    if (line.length > 40) continue;
    const parts = line.replace(/[|,·•]/g, ' ').split(/\s+/).filter((p) => /^[A-Za-zא-ת''-]{2,}$/.test(p));
    if (parts.length >= 2 && parts.length <= 4) {
      return { first: parts[0]!, last: parts.slice(1).join(' ') };
    }
  }

  // Last resort: a name-shaped local part of the email address.
  if (email) {
    const local = email.split('@')[0]!.replace(/\d+/g, '');
    const parts = local.split(/[._-]+/).filter((p) => p.length > 1);
    if (parts.length >= 2) {
      const capitalize = (value: string) => value[0]!.toUpperCase() + value.slice(1);
      return { first: capitalize(parts[0]!), last: capitalize(parts[1]!) };
    }
  }
  return { first: null, last: null };
}

function sectionsOf(allLines: string[]): Record<string, string[]> {
  const sections: Record<string, string[]> = {};
  let current = 'header';
  sections[current] = [];
  for (const line of allLines) {
    const matched = Object.entries(SECTION_HEADERS).find(([, re]) => re.test(line));
    if (matched) {
      current = matched[0];
      sections[current] ??= [];
      continue;
    }
    sections[current] ??= [];
    sections[current]!.push(line);
  }
  return sections;
}

function parseYear(value: string | undefined): number | null {
  if (!value) return null;
  const year = Number(value.match(/\d{4}/)?.[0]);
  return Number.isFinite(year) ? year : null;
}

function parseExperiences(section: string[] | undefined): ParsedExperience[] {
  if (!section?.length) return [];
  const experiences: ParsedExperience[] = [];
  // Lines already taken as the description of the entry above them. Without this a
  // description gets counted a second time as a job of its own, and the CV grows a
  // position the candidate never held.
  const consumed = new Set<number>();

  for (let i = 0; i < section.length; i += 1) {
    if (consumed.has(i)) continue;
    const line = section[i]!;
    const range = line.match(MONTH_RANGE_RE);
    // An entry is a line that carries a date range or an explicit company/title separator.
    const parts = line.split(/\s+[|–—-]\s+|\s*,\s*(?=[^\d])/).map((p) => p.trim()).filter(Boolean);
    if (!range && parts.length < 2) continue;
    // Hebrew prose is full of commas, so a comma alone does not make a line an entry.
    // A trailing full stop marks a sentence — a description, not a job header.
    if (!range && /[.!?]\s*$/.test(line)) continue;

    const withoutDates = line.replace(MONTH_RANGE_RE, '').replace(/[|–—-]\s*$/, '').trim();
    const fields = withoutDates.split(/\s+[|–—-]\s+|\s*,\s*/).map((p) => p.trim()).filter(Boolean);
    const title = fields[0] ?? '';
    const company = fields[1] ?? fields[0] ?? '';
    if (!title) continue;

    const isCurrent = Boolean(range && /היום|כיום|present|current|now/i.test(range[3] ?? ''));
    const next = section[i + 1];
    const description = next && !MONTH_RANGE_RE.test(next) && next.length > 30 ? next : null;
    if (description) consumed.add(i + 1);

    experiences.push({
      company: company === title ? '' : company,
      title,
      start_date: range?.[2] ? String(parseYear(range[2])) : null,
      end_date: isCurrent ? null : range?.[3] ? String(parseYear(range[3]) ?? '') || null : null,
      is_current: isCurrent,
      description,
    });
  }
  return experiences.slice(0, 12);
}

function findAll(text: string, keywords: string[]): string[] {
  const haystack = normalize(text);
  return keywords.filter((keyword) => haystack.includes(normalize(keyword)));
}

function yearsFromExperiences(experiences: ParsedExperience[]): number | null {
  const spans = experiences
    .map((experience) => {
      const start = parseYear(experience.start_date ?? undefined);
      if (!start) return 0;
      const end = experience.is_current
        ? new Date().getFullYear()
        : parseYear(experience.end_date ?? undefined) ?? start;
      return Math.max(0, end - start);
    })
    .filter((span) => span > 0);
  if (spans.length === 0) return null;
  const total = spans.reduce((sum, span) => sum + span, 0);
  return total > 0 ? total : null;
}

/**
 * Reads a CV's plain text into candidate fields.
 *
 * Rule-based on purpose: it is deterministic, runs with no API key, and — most
 * importantly — leaves a field null when the document does not contain it.
 */
export function parseCvText(text: string): ParsedCv {
  const allLines = lines(text);
  const sections = sectionsOf(allLines);
  const flat = allLines.join('\n');

  const email = flat.match(EMAIL_RE)?.[0]?.toLowerCase() ?? null;
  const phoneMatch = flat.match(PHONE_RE)?.[0] ?? null;
  const phone = phoneMatch ? normalizePhone(phoneMatch) : null;
  const { first, last } = detectName(allLines, email);

  /**
   * A town stated under an explicit label.
   *
   * The gazetteer cannot hold every locality in the country, and a candidate from one it
   * has never heard of should still have their town on file — the match then reports the
   * distance as unknown, which is true, rather than dropping the field and reporting
   * nothing at all.
   */
  const labelledCity = (() => {
    for (const line of allLines) {
      const match = line.match(/^\s*(?:כתובת|עיר|יישוב|ישוב|מגורים|מקום\s+מגורים|address|city)\s*:\s*(.+)$/i);
      if (!match?.[1]) continue;
      const value = match[1].split(/[,|]/)[0]!.trim().replace(/[.\s]+$/, '');
      if (value.length >= 2 && value.length <= 40) return value;
    }
    return null;
  })();

  const city =
    allLines
      .flatMap((line) => line.split(/[\s,|]+/))
      .map((token) => lookupPlace(token))
      .find((place): place is NonNullable<typeof place> => place !== null)?.city ??
    (() => {
      // Two-word city names ("קריית אתא") need a windowed scan.
      for (const line of allLines) {
        const tokens = line.split(/[\s,|]+/);
        for (let i = 0; i < tokens.length - 1; i += 1) {
          const place = lookupPlace(`${tokens[i]} ${tokens[i + 1]}`);
          if (place) return place.city;
        }
      }
      return labelledCity;
    })();

  const licenses = Array.from(
    new Set(LICENSE_PATTERNS.filter(({ re }) => re.test(flat)).map(({ label }) => label)),
  );
  const certifications = findAll(flat, CERTIFICATION_KEYWORDS);
  const skills = findAll(flat, SKILL_KEYWORDS);
  const languages = findAll(flat, LANGUAGE_KEYWORDS);
  const experiences = parseExperiences(sections.experience);

  const education = sections.education?.slice(0, 4).join(' · ') || null;

  const statedYears = flat.match(/(\d{1,2})\s*(?:\+\s*)?שנ(?:ות|ים)\s+ניסיון/);
  const yearsExperience = statedYears
    ? Number(statedYears[1])
    : yearsFromExperiences(experiences);

  const currentRole =
    experiences.find((experience) => experience.is_current)?.title ?? experiences[0]?.title ?? null;

  const missing: string[] = [];
  if (!first) missing.push('שם');
  if (!phone) missing.push('טלפון');
  if (!email) missing.push('אימייל');
  if (!city) missing.push('עיר');
  if (experiences.length === 0) missing.push('ניסיון תעסוקתי');
  if (!education) missing.push('השכלה');

  const found = 6 - missing.length;
  const confidence = Math.round((found / 6) * 100);

  return {
    first_name: first,
    last_name: last,
    phone,
    email,
    city,
    region: city ? regionOfCity(city) : null,
    current_role: currentRole,
    years_experience: yearsExperience,
    education,
    licenses,
    has_car: detectCar(text),
    certifications,
    skills,
    languages,
    experiences,
    missing,
    confidence,
  };
}

/** Maps parser output onto the candidate form payload. */
export function parsedCvToCandidateInput(parsed: ParsedCv, source = 'cv_upload') {
  return {
    first_name: parsed.first_name ?? '',
    last_name: parsed.last_name ?? '',
    phone: parsed.phone,
    whatsapp: parsed.phone,
    email: parsed.email,
    city: parsed.city,
    region: parsed.region,
    current_role: parsed.current_role,
    years_experience: parsed.years_experience,
    education: parsed.education,
    // A driving licence implies a driver even when the CV never says "car".
    has_car: parsed.has_car ?? (parsed.licenses.length > 0 ? true : null),
    source,
    attributes: [
      ...parsed.licenses.map((value) => ({ kind: 'license' as const, value })),
      ...parsed.certifications.map((value) => ({ kind: 'certification' as const, value })),
      ...parsed.skills.map((value) => ({ kind: 'skill' as const, value })),
      ...parsed.languages.map((value) => ({ kind: 'language' as const, value })),
    ],
    experiences: parsed.experiences.map((experience) => ({
      company: experience.company || '—',
      title: experience.title,
      start_date: experience.start_date,
      end_date: experience.end_date,
      is_current: experience.is_current,
      description: experience.description,
    })),
    tags: parsed.licenses.map((license) => canonical(license).toUpperCase()).filter(Boolean),
  };
}
