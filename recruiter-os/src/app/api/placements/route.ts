import { z } from 'zod';
import { placementSchema } from '@/lib/schemas';
import { createPlacement, listPlacements } from '@/lib/domain/placements';
import { json, parseBody, parseQuery, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  clientId: z.string().max(60).optional(),
  status: z.string().max(20).optional(),
  from: z.string().max(30).optional(),
  to: z.string().max(30).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const GET = withAuth(async (request, { auth }) =>
  json({ placements: listPlacements(auth.org.id, parseQuery(request, querySchema)) }),
);

export const POST = withAuth(async (request, { auth }) => {
  const input = await parseBody(request, placementSchema);
  const placement = createPlacement(auth.org.id, auth.user.id, input);
  return json({ placement }, { status: 201 });
});
