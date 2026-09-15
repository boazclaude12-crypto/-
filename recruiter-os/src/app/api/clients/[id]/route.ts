import { clientUpdateSchema } from '@/lib/schemas';
import { deleteClient, getClientDetail, updateClient } from '@/lib/domain/clients';
import { json, notFound, parseBody, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<{ id: string }>(async (_request, { auth, params }) => {
  const detail = getClientDetail(auth.org.id, params.id);
  if (!detail) throw notFound('לקוח לא נמצא');
  return json(detail);
});

export const PATCH = withAuth<{ id: string }>(async (request, { auth, params }) => {
  const input = await parseBody(request, clientUpdateSchema);
  const client = updateClient(auth.org.id, auth.user.id, params.id, input);
  if (!client) throw notFound('לקוח לא נמצא');
  return json({ client });
});

export const DELETE = withAuth<{ id: string }>(async (_request, { auth, params }) => {
  if (!deleteClient(auth.org.id, params.id)) throw notFound('לקוח לא נמצא');
  return new Response(null, { status: 204 });
});
