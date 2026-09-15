import { repos } from '@/lib/db/repos';
import { deleteStoredFile, readStoredFile } from '@/lib/documents/storage';
import { notFound, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Authenticated download. The org check is what keeps CVs private between accounts. */
export const GET = withAuth<{ id: string }>(async (_request, { auth, params }) => {
  const document = repos.candidateDocuments.find(auth.org.id, params.id);
  if (!document) throw notFound('מסמך לא נמצא');

  const buffer = readStoredFile(document.stored_name);
  if (!buffer) throw notFound('הקובץ אינו זמין');

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': document.mime_type,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(document.file_name)}`,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'private, no-store',
    },
  });
});

export const DELETE = withAuth<{ id: string }>(async (_request, { auth, params }) => {
  const document = repos.candidateDocuments.find(auth.org.id, params.id);
  if (!document) throw notFound('מסמך לא נמצא');
  deleteStoredFile(document.stored_name);
  repos.candidateDocuments.remove(auth.org.id, params.id);
  return new Response(null, { status: 204 });
});
