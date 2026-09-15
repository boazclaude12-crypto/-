import { normalize } from '../text';

/** Candidate fields an import can fill. Anything else in the file is ignored. */
export type ImportField =
  | 'first_name' | 'last_name' | 'full_name' | 'phone' | 'email' | 'city'
  | 'current_role' | 'years_experience' | 'education' | 'desired_salary'
  | 'availability' | 'max_commute_km' | 'has_car' | 'notes' | 'tags' | 'skills';

export const IMPORT_FIELDS: Array<{ value: ImportField; label: string }> = [
  { value: 'full_name', label: 'שם מלא' },
  { value: 'first_name', label: 'שם פרטי' },
  { value: 'last_name', label: 'שם משפחה' },
  { value: 'phone', label: 'טלפון' },
  { value: 'email', label: 'אימייל' },
  { value: 'city', label: 'עיר' },
  { value: 'current_role', label: 'תפקיד' },
  { value: 'years_experience', label: 'שנות ניסיון' },
  { value: 'education', label: 'השכלה' },
  { value: 'desired_salary', label: 'שכר מבוקש' },
  { value: 'availability', label: 'זמינות' },
  { value: 'max_commute_km', label: 'טווח נסיעה (ק"מ)' },
  { value: 'has_car', label: 'רכב' },
  { value: 'skills', label: 'כישורים / רישיונות' },
  { value: 'tags', label: 'תגיות' },
  { value: 'notes', label: 'הערות' },
];

/**
 * Header wordings seen in real recruiter spreadsheets, in both languages.
 *
 * Order matters: the first field whose patterns match a header wins, so the more specific
 * wordings are listed before the ones that would also match them.
 */
const PATTERNS: Array<{ field: ImportField; words: string[] }> = [
  { field: 'first_name', words: ['שם פרטי', 'first name', 'firstname', 'given name'] },
  { field: 'last_name', words: ['שם משפחה', 'משפחה', 'last name', 'lastname', 'surname', 'family name'] },
  { field: 'full_name', words: ['שם מלא', 'שם המועמד', 'שם', 'name', 'candidate'] },
  { field: 'phone', words: ['טלפון', 'נייד', 'פלאפון', 'סלולרי', 'וואטסאפ', 'whatsapp', 'phone', 'mobile', 'cell', 'tel'] },
  { field: 'email', words: ['אימייל', 'מייל', 'דואל', 'דוא"ל', 'email', 'mail', 'e-mail'] },
  { field: 'city', words: ['עיר', 'יישוב', 'ישוב', 'מגורים', 'כתובת', 'city', 'town', 'address', 'location'] },
  { field: 'current_role', words: ['תפקיד', 'משרה', 'עיסוק', 'מקצוע', 'role', 'position', 'title', 'job'] },
  { field: 'years_experience', words: ['שנות ניסיון', 'ותק', 'ניסיון', 'experience', 'years'] },
  { field: 'education', words: ['השכלה', 'לימודים', 'תואר', 'education', 'degree'] },
  { field: 'desired_salary', words: ['שכר מבוקש', 'ציפיות שכר', 'שכר', 'salary', 'expected'] },
  { field: 'availability', words: ['זמינות', 'מתי פנוי', 'availability', 'available'] },
  { field: 'max_commute_km', words: ['טווח נסיעה', 'מרחק', 'נסיעה', 'commute', 'distance'] },
  { field: 'has_car', words: ['רכב', 'ניידות', 'car', 'vehicle'] },
  { field: 'skills', words: ['כישורים', 'רישיונות', 'רישיון', 'מיומנויות', 'skills', 'licence', 'license'] },
  { field: 'tags', words: ['תגיות', 'תגית', 'קטגוריה', 'tags', 'tag', 'category'] },
  { field: 'notes', words: ['הערות', 'הערה', 'תיאור', 'notes', 'comment', 'remarks'] },
];

/**
 * Guesses which column holds which field.
 *
 * Every column the recruiter has to map by hand is a reason to abandon the import, so the
 * common spreadsheet is expected to arrive already mapped — but the guess is always shown
 * for correction, because a wrong column silently files phone numbers as salaries.
 */
export function guessMapping(headers: string[]): Record<number, ImportField | ''> {
  const mapping: Record<number, ImportField | ''> = {};
  const taken = new Set<ImportField>();

  headers.forEach((header, index) => {
    // Plain normalisation, never `canonical`: that one folds recruitment vocabulary away
    // — "רישיון" reduces to nothing, since it is noise in "רישיון C" — and an empty
    // needle matches every header, quietly mapping unrelated columns onto real fields.
    const normalised = normalize(header);
    if (!normalised) {
      mapping[index] = '';
      return;
    }
    const hit = PATTERNS.find(
      ({ field, words }) =>
        !taken.has(field) &&
        words.some((word) => {
          const needle = normalize(word);
          return needle.length > 0 && normalised.includes(needle);
        }),
    );
    // A name column that lands after first_name is the surname, not a second full name.
    if (hit) {
      taken.add(hit.field);
      mapping[index] = hit.field;
    } else {
      mapping[index] = '';
    }
  });

  return mapping;
}

const TRUTHY = /^(כן|יש|true|yes|y|1|v|✓)$/i;

/** Reads a spreadsheet cell that is meant to be a yes/no. */
export function parseBoolean(value: string): boolean {
  return TRUTHY.test(value.trim());
}

/** Reads a number from a cell that may carry a currency sign or thousands separators. */
export function parseNumber(value: string): number | null {
  const digits = value.replace(/[^\d.]/g, '');
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}
