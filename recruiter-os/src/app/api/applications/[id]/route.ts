import { getApplicationDetail, removeApplication } from '@/lib/domain/applications';
import { json, notFound, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<{ id: string }>(async (_request, { auth, params }) => {
  const detail = getApplicationDetail(auth.org.id, params.id);
  if (!detail) throw notFound('שיוך לא נמצא');
  return json(detail);
});

export const DELETE = withAuth<{ id: string }>(async (_request, { auth, params }) => {
  if (!removeApplication(auth.org.id, params.id)) throw notFound('שיוך לא נמצא');
  return new Response(null, { status: 204 });
});
