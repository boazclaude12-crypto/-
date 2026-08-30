import { createCandidate } from './candidates';
import { findExistingCandidate } from './cv-intake';
import { candidateSchema } from '../schemas';
import { normalizePhone } from '../text';
import { regionOfCity } from '../geo';
import { parseBoolean, parseNumber, type ImportField } from './import-map';

export interface ImportRowResult {
  row: number;
  status: 'created' | 'duplicate' | 'skipped';
  candidateId: string | null;
  name: string;
  reason: string | null;
}

export interface ImportSummary {
  total: number;
  created: number;
  duplicates: number;
  skipped: number;
}

function splitList(value: string): string[] {
  return value
    .split(/[,;|/]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 20);
}

/**
 * Turns one spreadsheet row into the shape a candidate is created from.
 *
 * Everything the file does not say stays empty. A spreadsheet is a record of what someone
 * bothered to type, and filling the gaps with defaults would put facts on a candidate's
 * profile that nobody ever asserted.
 */
function toInput(row: string[], mapping: Record<number, ImportField | ''>) {
  const values = {} as Partial<Record<ImportField, string>>;
  for (const [index, field] of Object.entries(mapping)) {
    if (!field) continue;
    const cell = row[Number(index)]?.trim();
    if (cell) values[field] = cell;
  }

  let firstName = values.first_name ?? '';
  let lastName = values.last_name ?? '';
  if (!firstName && values.full_name) {
    const parts = values.full_name.split(/\s+/).filter(Boolean);
    firstName = parts[0] ?? '';
    lastName = lastName || parts.slice(1).join(' ');
  }

  const phone = values.phone ? normalizePhone(values.phone) : null;
  const city = values.city ?? null;
  const skills = values.skills ? splitList(values.skills) : [];

  return {
    input: {
      first_name: firstName,
      last_name: lastName || null,
      phone,
      whatsapp: phone,
      email: values.email ?? null,
      city,
      region: city ? regionOfCity(city) : null,
      current_role: values.current_role ?? null,
      years_experience: values.years_experience ? parseNumber(values.years_experience) : null,
      education: values.education ?? null,
      desired_salary: values.desired_salary ? parseNumber(values.desired_salary) : null,
      availability: values.availability ?? null,
      max_commute_km: values.max_commute_km ? parseNumber(values.max_commute_km) : null,
      has_car: values.has_car ? (parseBoolean(values.has_car) ? 1 : 0) : 0,
      notes: values.notes ?? null,
      source: 'import',
      // A licence column is what makes an imported candidate matchable at all, so the
      // values are filed as attributes rather than left as free text.
      attributes: skills.map((value) => ({ kind: 'skill' as const, value })),
      tags: values.tags ? splitList(values.tags) : [],
    },
    phone,
    email: values.email ?? null,
    name: `${firstName} ${lastName}`.trim(),
  };
}

/**
 * Imports rows from a spreadsheet the recruiter already keeps.
 *
 * This is the path off the existing spreadsheet, and it has to be forgiving: a row with
 * no name and no number is skipped rather than filed as an empty record, and a candidate
 * already on file is reported rather than duplicated. Every row gets a verdict, because
 * an import that quietly drops a third of a list is worse than one that fails outright.
 */
export function importRows(
  orgId: string,
  userId: string,
  rows: string[][],
  mapping: Record<number, ImportField | ''>,
): { summary: ImportSummary; results: ImportRowResult[] } {
  const results: ImportRowResult[] = [];
  // Rows repeat inside one file too — the same person listed twice under two jobs.
  const seenInFile = new Set<string>();

  rows.forEach((row, index) => {
    const { input, phone, email, name } = toInput(row, mapping);
    const rowNumber = index + 1;

    if (!input.first_name && !phone && !email) {
      results.push({ row: rowNumber, status: 'skipped', candidateId: null, name: name || '—', reason: 'אין שם ואין פרטי קשר' });
      return;
    }

    const key = phone ?? (email ? email.toLowerCase() : '');
    if (key && seenInFile.has(key)) {
      results.push({ row: rowNumber, status: 'duplicate', candidateId: null, name, reason: 'מופיע פעמיים בקובץ' });
      return;
    }
    if (key) seenInFile.add(key);

    const existing = findExistingCandidate(orgId, phone, email);
    if (existing) {
      results.push({ row: rowNumber, status: 'duplicate', candidateId: existing.id, name, reason: 'כבר קיים במערכת' });
      return;
    }

    try {
      const parsed = candidateSchema.parse({ ...input, first_name: input.first_name || 'ללא שם' });
      const candidate = createCandidate(orgId, userId, parsed);
      results.push({ row: rowNumber, status: 'created', candidateId: candidate.id, name: name || candidate.first_name, reason: null });
    } catch (caught) {
      results.push({
        row: rowNumber,
        status: 'skipped',
        candidateId: null,
        name: name || '—',
        reason: caught instanceof Error ? caught.message : 'שורה לא תקינה',
      });
    }
  });

  return {
    summary: {
      total: results.length,
      created: results.filter((r) => r.status === 'created').length,
      duplicates: results.filter((r) => r.status === 'duplicate').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
    },
    results,
  };
}
