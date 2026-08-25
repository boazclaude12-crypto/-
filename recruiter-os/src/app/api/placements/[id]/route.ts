import { placementUpdateSchema } from '@/lib/schemas';
import { deletePlacement, updatePlacement } from '@/lib/domain/placements';
import { json, notFound, parseBody, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = withAuth<{ id: string }>(async (request, { auth, params }) => {
  const input = await parseBody(request, placementUpdateSchema);
  const placement = updatePlacement(auth.org.id, auth.user.id, params.id, input);
  if (!placement) throw notFound('השמה לא נמצאה');
  return json({ placement });
});

export const DELETE = withAuth<{ id: string }>(async (_request, { auth, params }) => {
  if (!deletePlacement(auth.org.id, params.id)) throw notFound('השמה לא נמצאה');
  return new Response(null, { status: 204 });
});
