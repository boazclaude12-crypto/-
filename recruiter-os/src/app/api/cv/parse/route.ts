import { extractText } from '@/lib/documents/extract';
import { getAiProvider, parsedCvToCandidateInput } from '@/lib/ai/index';
import { ApiError, json, withAuth } from '@/lib/http';
import { MAX_UPLOAD_BYTES } from '@/lib/documents/extract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Parses a CV without saving anything, so the "new candidate from CV" flow can show a
 * preview the recruiter confirms or corrects before the record is created.
 */
export const POST = withAuth(async (request, { auth }) => {
  void auth;
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new ApiError(400, 'לא נשלח קובץ');
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, 'הקובץ גדול מדי');

  const buffer = Buffer.from(await file.arrayBuffer());
  const extracted = extractText(buffer, file.type, file.name);

  if (extracted.status !== 'parsed' || !extracted.text) {
    return json({ status: extracted.status, reason: extracted.reason ?? null, parsed: null, form: null });
  }

  const parsed = await getAiProvider().parseCv(extracted.text);
  return json({
    status: 'parsed',
    reason: null,
    parsed,
    form: parsedCvToCandidateInput(parsed),
    preview: extracted.text.slice(0, 1500),
  });
}, { limit: 40, windowMs: 60_000 });
