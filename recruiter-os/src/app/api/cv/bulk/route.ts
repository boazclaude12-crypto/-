import { MAX_UPLOAD_BYTES } from '@/lib/documents/extract';
import { importApplication, type IntakeOutcome } from '@/lib/domain/cv-intake';
import { ApiError, json, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILES = 40;

export interface BulkImportRow extends IntakeOutcome {
  fileName: string;
}

/**
 * Imports a batch of CVs in one pass.
 *
 * Every file gets a row in the response whatever happens to it: a silent partial import
 * is the worst outcome here, because the recruiter would have no way to tell which of
 * forty CVs actually landed.
 */
export const POST = withAuth(async (request, { auth }) => {
  const form = await request.formData();
  const files = form.getAll('files').filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) throw new ApiError(400, 'לא נשלחו קבצים');
  if (files.length > MAX_FILES) throw new ApiError(413, `אפשר להעלות עד ${MAX_FILES} קבצים בבת אחת`);

  const results: BulkImportRow[] = [];
  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      results.push({
        fileName: file.name, status: 'unreadable', candidateId: null, name: null,
        city: null, phone: null, missing: [], reason: 'הקובץ גדול מדי',
      });
      continue;
    }
    const outcome = await importApplication(auth.org.id, auth.user.id, {
      document: { file },
      note: `יובא מקובץ ${file.name}`,
    });
    results.push({ ...outcome, fileName: file.name });
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
