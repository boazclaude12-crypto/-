import { repos } from '../db/repos';
import { getDb } from '../db/index';
import { storeUpload } from '../documents/storage';
import { extractText } from '../documents/extract';
import { getAiProvider, parsedCvToCandidateInput } from '../ai/index';
import { createCandidate } from './candidates';
import { candidateSchema } from '../schemas';
import { normalizePhone } from '../text';
import { ApiError } from '../errors';

export interface IntakeHints {
  first_name?: string | null;
  last_name?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  /** The opening the person applied to, as named by whoever sent the application. */
  job_title?: string | null;
}

export interface IntakeOutcome {
  status: 'created' | 'duplicate' | 'unreadable' | 'failed';
  candidateId: string | null;
  name: string | null;
  city: string | null;
  phone: string | null;
  missing: string[];
  reason: string | null;
}

/**
 * Finds an existing candidate for an incoming application.
 *
 * Phone first, then email. The same CV genuinely arrives more than once — forwarded,
 * re-sent, applied to two openings — and three records for one person costs more than
 * missing a rare genuine namesake, which the recruiter can still add by hand.
 */
export function findExistingCandidate(orgId: string, phone: string | null, email: string | null) {
  const db = getDb();
  if (phone) {
    const byPhone = db.get<{ id: string }>(
      'SELECT id FROM candidates WHERE org_id = ? AND (phone = ? OR whatsapp = ?) LIMIT 1',
      orgId, phone, phone,
    );
    if (byPhone) return byPhone;
  }
  if (email) {
    return (
      db.get<{ id: string }>(
        'SELECT id FROM candidates WHERE org_id = ? AND lower(email) = lower(?) LIMIT 1',
        orgId, email,
      ) ?? null
    );
  }
  return null;
}

/**
 * Turns one incoming application into a candidate record.
 *
 * The single path used by both the drag-and-drop importer and the mailbox sync, so the
 * two cannot drift into disagreeing about de-duplication or about which source wins.
 *
 * Where a document and a set of hints disagree, the hints win for name, town and phone:
 * those come from a form the candidate filled in, while the same fields in a CV are
 * recovered heuristically from free text. Everything else — experience, licences,
 * education — comes from the document, which is the only place it exists.
 *
 * A document is optional. An application with no readable CV but a name and a phone is
 * still a real lead and is filed as one.
 */
export async function importApplication(
  orgId: string,
  userId: string,
  input: {
    document?: { file: File } | { buffer: Buffer; fileName: string; mimeType: string };
    hints?: IntakeHints;
    note?: string;
  },
): Promise<IntakeOutcome> {
  const hints = input.hints ?? {};
  const blank: IntakeOutcome = {
    status: 'failed', candidateId: null, name: null, city: null, phone: null, missing: [], reason: null,
  };

  try {
    let stored: Awaited<ReturnType<typeof storeUpload>> | null = null;
    let extracted: ReturnType<typeof extractText> | null = null;
    let unreadableReason: string | null = null;

    if (input.document) {
      // A rejected or unreadable attachment must not sink the whole application. Mail
      // brings scans, images and odd formats, and an application that names the person
      // and their number is worth filing whether or not the file came through.
      try {
        if ('file' in input.document) {
          stored = await storeUpload(orgId, input.document.file);
        } else {
          const { buffer, fileName, mimeType } = input.document;
          stored = await storeUpload(orgId, new File([new Uint8Array(buffer)], fileName, { type: mimeType }));
        }
        extracted = extractText(stored.buffer, stored.mimeType, stored.fileName);
        if (extracted.status !== 'parsed' || !extracted.text) {
          unreadableReason = extracted.reason ?? 'לא ניתן לקרוא את הקובץ';
        }
      } catch (caught) {
        if (!(caught instanceof ApiError) || caught.status >= 500) throw caught;
        stored = null;
        extracted = null;
        unreadableReason = caught.message;
      }
    }

    const parsed = extracted?.text ? await getAiProvider().parseCv(extracted.text) : null;

    const phone = hints.phone
      ? normalizePhone(hints.phone)
      : parsed?.phone
        ? normalizePhone(parsed.phone)
        : null;
    const email = hints.email ?? parsed?.email ?? null;
    const firstName = hints.first_name || parsed?.first_name || null;

    // Nothing identifying at all: no name, no phone, no email, no readable text. There is
    // no lead here, only a file — say so rather than filing an empty record.
    if (!firstName && !phone && !email) {
      return { ...blank, status: 'unreadable', reason: unreadableReason ?? 'לא נמצאו פרטי קשר' };
    }

    const existing = findExistingCandidate(orgId, phone, email);
    if (existing) {
      return {
        ...blank,
        status: 'duplicate',
        candidateId: existing.id,
        name: [firstName, hints.last_name || parsed?.last_name].filter(Boolean).join(' ') || null,
        phone,
        reason: 'כבר קיים במערכת',
      };
    }

    const base = parsed ? parsedCvToCandidateInput(parsed) : {};
    const candidateInput = candidateSchema.parse({
      ...base,
      first_name: firstName || 'ללא שם',
      last_name: hints.last_name || parsed?.last_name || null,
      city: hints.city || parsed?.city || null,
      phone,
      whatsapp: phone,
      email,
      has_car: parsed?.has_car === true ? 1 : 0,
      source: 'cv_upload',
      notes: input.note ?? null,
    });
    const candidate = createCandidate(orgId, userId, candidateInput);

    if (stored && extracted) {
      repos.candidateDocuments.create(orgId, {
        candidate_id: candidate.id,
        kind: 'cv',
        file_name: stored.fileName,
        stored_name: stored.storedName,
        mime_type: stored.mimeType,
        size_bytes: stored.size,
        text_content: extracted.text || null,
        parse_status: extracted.status,
      });
    }

    return {
      status: 'created',
      candidateId: candidate.id,
      name: `${candidate.first_name} ${candidate.last_name}`.trim(),
      city: candidate.city,
      phone: candidate.phone,
      missing: parsed?.missing ?? [],
      reason: unreadableReason ? `נוצר מפרטי הפנייה — ${unreadableReason}` : null,
    };
  } catch (caught) {
    // A rejected file is the sender's problem and says nothing about the rest of a batch;
    // only an unexpected error is a failure of ours.
    const rejected = caught instanceof ApiError && caught.status < 500;
    return {
      ...blank,
      status: rejected ? 'unreadable' : 'failed',
      reason: caught instanceof Error ? caught.message : 'שגיאה לא ידועה',
    };
  }
}
