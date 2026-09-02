import { candidateUpdateSchema } from '@/lib/schemas';
import { deleteCandidate, getCandidateDetail, updateCandidate } from '@/lib/domain/candidates';
import { json, notFound, parseBody, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<{ id: string }>(async (_request, { auth, params }) => {
  const detail = getCandidateDetail(auth.org.id, params.id);
  if (!detail) throw notFound('מועמד לא נמצא');
  return json(detail);
});

export const PATCH = withAuth<{ id: string }>(async (request, { auth, params }) => {
  const input = await parseBody(request, candidateUpdateSchema);
  const candidate = updateCandidate(auth.org.id, auth.user.id, params.id, input);
  if (!candidate) throw notFound('מועמד לא נמצא');
  return json({ candidate });
});

export const DELETE = withAuth<{ id: string }>(async (_request, { auth, params }) => {
  if (!deleteCandidate(auth.org.id, params.id)) throw notFound('מועמד לא נמצא');
  return new Response(null, { status: 204 });
});
