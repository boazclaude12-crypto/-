import { normalizePhone } from '../text';

export interface EmailIntakeResult {
  /** Which format matched. 'generic' means only loose extraction was possible. */
  source: 'alljobs' | 'generic';
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  /** The job the person applied to, as the board named it. */
  job_title: string | null;
  /** Board-side reference, useful for de-duplicating re-sent notifications. */
  external_ref: string | null;
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_RE = /(?:\+972[-\s]?|0)(?:5\d|[2-4]|[8-9]|7\d)[-\s]?\d{3}[-\s]?\d{4}/;

/**
 * Job-board notifications arrive as HTML tables, which flatten to lines fenced by pipes.
 * Stripping them turns the body back into ordinary labelled lines.
 */
function cleanLines(body: string): string[] {
  return body
    .split('\n')
    .map((line) => line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').trim())
    .filter(Boolean);
}

function labelled(lines: string[], label: RegExp): string | null {
  for (const line of lines) {
    const match = line.match(label);
    if (match?.[1]) {
      const value = match[1].trim().replace(/\|/g, '').trim();
      if (value) return value;
    }
  }
  return null;
}

/**
 * Splits a display name into first and last.
 *
 * Hebrew names are given first, so the leading token is the first name and the remainder
 * is the surname — which keeps multi-word surnames ("דה לה רוסה") intact instead of
 * dropping everything after the second word.
 */
function splitName(full: string): { first: string | null; last: string | null } {
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0]!, last: null };
  return { first: parts[0]!, last: parts.slice(1).join(' ') };
}

/**
 * Reads a candidate out of a job-board application email.
 *
 * AllJobs — which is where most applications on an Israeli staffing desk arrive from —
 * states the name, town, phone and the job applied for in the body, already separated
 * out. That is better data than the CV: it is what the candidate typed into the board,
 * and it names the job, so the application can be filed against the right opening
 * instead of landing in a general pool.
 *
 * Anything else falls back to pulling a phone and an email address out of the text, and
 * says so, so a partial read is never mistaken for a parsed one.
 */
export function parseIntakeEmail(input: {
  subject?: string | null;
  body: string;
  from?: string | null;
}): EmailIntakeResult {
  const lines = cleanLines(input.body);
  const joined = lines.join('\n');

  const fullName = labelled(lines, /שם\s+המועמד\s*:\s*(.+)/);
  const city = labelled(lines, /מגורים\s*:\s*(.+)/);
  const phoneLabel = labelled(lines, /טלפון\s*:\s*(.+)/);

  // The job title is quoted on its own line, after the sentence announcing the CV.
  const jobTitle =
    joined.match(/למשרת\s*:?\s*\n?\s*"([^"]+)"/)?.[1]?.trim() ??
    joined.match(/למשרת\s*:?\s*"([^"]+)"/)?.[1]?.trim() ??
    input.subject?.match(/למשרת\s+(.+?)\s*$/)?.[1]?.trim() ??
    null;

  const jobId = joined.match(/JobID=(\d+)/)?.[1] ?? null;
  const isAllJobs =
    /alljobs?\./i.test(input.from ?? '') || (fullName !== null && jobTitle !== null);

  const rawPhone = phoneLabel ?? joined.match(PHONE_RE)?.[0] ?? null;
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  const email = joined.match(EMAIL_RE)?.[0] ?? null;

  if (isAllJobs && fullName) {
    const { first, last } = splitName(fullName);
    return {
      source: 'alljobs',
      first_name: first,
      last_name: last,
      full_name: fullName,
      phone,
      email: null, // The board relays replies; the address in the body is never the candidate's.
      city,
      job_title: jobTitle,
      external_ref: jobId ? `alljobs:${jobId}` : null,
    };
  }

  return {
    source: 'generic',
    first_name: null,
    last_name: null,
    full_name: null,
    phone,
    email: email && !/alljob/i.test(email) ? email : null,
    city: null,
    job_title: null,
    external_ref: null,
  };
}
