import { repos } from '@/lib/db/repos';
import { getDb } from '@/lib/db/index';
import { storeUpload } from '@/lib/documents/storage';
import { extractText, MAX_UPLOAD_BYTES } from '@/lib/documents/extract';
import { getAiProvider, parsedCvToCandidateInput } from '@/lib/ai/index';
import { createCandidate } from '@/lib/domain/candidates';
import { candidateSchema } from '@/lib/schemas';
import { ApiError, json, withAuth } from '@/lib/http';
import { normalizePhone } from '@/lib/text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILES = 40;

export interface BulkImportRow {
  fileName: string;
  status: 'created' | 'duplicate' | 'unreadable' | 'failed';
  candidateId: string | null;
  name: string | null;
  city: string | null;
  phone: string | null;
  /** Fields the CV did not contain — the recruiter fills these in later. */
  missing: string[];
  reason: string | null;
}

/**
 * Finds an existing candidate for a parsed CV.
 *
 * Phone first, then email: importing a mailbox means the same CV arrives more than once —
 * forwarded, re-sent, attached to two threads — and silently creating three records for
 * one person is worse than skipping a genuine second candidate, which the recruiter can
 * still add by hand.
 */
function findExisting(orgId: string, phone: string | null, email: string | null) {
  const db = getDb();
  if (phone) {
    const byPhone = db.get<{ id: string }>(
      'SELECT id FROM candidates WHERE org_id = ? AND (phone = ? OR whatsapp = ?) LIMIT 1',
      orgId, phone, phone,
    );
    if (byPhone) return byPhone;
  }
  if (email) {
    return db.get<{ id: string }>(
      'SELECT id FROM candidates WHERE org_id = ? AND lower(email) = lower(?) LIMIT 1',
      orgId, email,
    ) ?? null;
  }
  return null;
}

/**
 * Imports a batch of CVs in one pass: parse, de-duplicate, create the candidate, and
 * attach the original file to the record it produced.
 *
 * Every file gets a row in the response whatever happens to it. A silent partial import
 * is the worst outcome here — the recruiter would have no way to tell which of forty CVs
 * actually landed.
 */
export const POST = withAuth(async (request, { auth }) => {
  const form = await request.formData();
  const files = form.getAll('files').filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) throw new ApiError(400, 'לא נשלחו קבצים');
  if (files.length > MAX_FILES) throw new ApiError(413, `אפשר להעלות עד ${MAX_FILES} קבצים בבת אחת`);

  const provider = getAiProvider();
  const results: BulkImportRow[] = [];

  for (const file of files) {
    const row: BulkImportRow = {
      fileName: file.name,
      status: 'failed',
      candidateId: null,
      name: null,
      city: null,
      phone: null,
      missing: [],
      reason: null,
    };

    try {
      if (file.size > MAX_UPLOAD_BYTES) {
        results.push({ ...row, status: 'unreadable', reason: 'הקובץ גדול מדי' });
        continue;
      }

      const stored = await storeUpload(auth.org.id, file);
      const extracted = extractText(stored.buffer, stored.mimeType, stored.fileName);

      if (extracted.status !== 'parsed' || !extracted.text) {
        results.push({
          ...row,
          status: 'unreadable',
          reason: extracted.reason ?? 'לא ניתן לקרוא את הקובץ',
        });
        continue;
      }

      const parsed = await provider.parseCv(extracted.text);
      const phone = parsed.phone ? normalizePhone(parsed.phone) : null;

      const existing = findExisting(auth.org.id, phone, parsed.email);
      if (existing) {
        results.push({
          ...row,
          status: 'duplicate',
          candidateId: existing.id,
          name: [parsed.first_name, parsed.last_name].filter(Boolean).join(' ') || null,
          phone,
          reason: 'כבר קיים במערכת',
        });
        continue;
      }

      const input = candidateSchema.parse({
        ...parsedCvToCandidateInput(parsed),
        // A CV without a readable name still becomes a record — losing the phone number
        // of a real candidate because the header was an image helps nobody.
        first_name: parsed.first_name || 'ללא שם',
        has_car: parsed.has_car === true ? 1 : 0,
        notes: `יובא מקובץ ${file.name}`,
      });
      const candidate = createCandidate(auth.org.id, auth.user.id, input);

      repos.candidateDocuments.create(auth.org.id, {
        candidate_id: candidate.id,
        kind: 'cv',
        file_name: stored.fileName,
        stored_name: stored.storedName,
        mime_type: stored.mimeType,
        size_bytes: stored.size,
        text_content: extracted.text,
        parse_status: extracted.status,
      });
      results.push({
        fileName: file.name,
        status: 'created',
        candidateId: candidate.id,
        name: `${candidate.first_name} ${candidate.last_name}`.trim(),
        city: candidate.city,
        phone: candidate.phone,
        missing: parsed.missing,
        reason: null,
      });
    } catch (caught) {
      // A rejected file — wrong type, empty, oversized — is the recruiter's to fix and
      // says nothing about the rest of the batch. Only an unexpected error is a failure.
      const rejected = caught instanceof ApiError && caught.status < 500;
      results.push({
        ...row,
        status: rejected ? 'unreadable' : 'failed',
        reason: caught instanceof Error ? caught.message : 'שגיאה לא ידועה',
      });
    }
  }

  const summary = {
    total: results.length,
    created: results.filter((r) => r.status === 'created').length,
    duplicates: results.filter((r) => r.status === 'duplicate').length,
    unreadable: results.filter((r) => r.status === 'unreadable').length,
    failed: results.filter((r) => r.status === 'failed').length,
  };

  return json({ summary, results }, { status: 201 });
}, { limit: 6, windowMs: 60_000 });
