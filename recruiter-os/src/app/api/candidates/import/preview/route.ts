import { readSheet, MAX_IMPORT_ROWS } from '@/lib/documents/tabular';
import { guessMapping } from '@/lib/domain/import-map';
import { MAX_UPLOAD_BYTES } from '@/lib/documents/extract';
import { ApiError, json, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Reads a spreadsheet and returns it with a guessed column mapping.
 *
 * Nothing is written. The recruiter confirms which column is which before a single
 * record exists, because a mis-mapped column is far harder to undo than to prevent.
 */
export const POST = withAuth(async (request) => {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new ApiError(400, 'לא נשלח קובץ');
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, 'הקובץ גדול מדי');
  if (!/\.(csv|xlsx|tsv|txt)$/i.test(file.name)) {
    throw new ApiError(415, 'נתמכים קבצי CSV ו-XLSX. באקסל: קובץ → שמירה בשם → CSV.');
  }

  const sheet = readSheet(Buffer.from(await file.arrayBuffer()), file.name);
  if (!sheet || sheet.rows.length === 0) {
    throw new ApiError(400, 'לא נמצאו שורות בקובץ. ודא שיש שורת כותרות ולפחות שורה אחת מתחתיה.');
  }

  return json({
    headers: sheet.headers,
    rows: sheet.rows,
    mapping: guessMapping(sheet.headers),
    truncated: sheet.truncated,
    maxRows: MAX_IMPORT_ROWS,
  });
}, { limit: 20, windowMs: 60_000 });
