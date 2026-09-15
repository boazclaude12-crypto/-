import { z } from 'zod';
import { candidateSchema } from '@/lib/schemas';
import { createCandidate, listCandidates } from '@/lib/domain/candidates';
import { json, parseBody, parseQuery, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.string().trim().max(40).optional(),
  city: z.string().trim().max(60).optional(),
  region: z.string().trim().max(40).optional(),
  availability: z.string().trim().max(30).optional(),
  tag: z.string().trim().max(40).optional(),
  jobId: z.string().trim().max(60).optional(),
  sort: z.enum(['recent', 'name', 'created']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const GET = withAuth(async (request, { auth }) => {
  const filters = parseQuery(request, querySchema);
  return json({ candidates: listCandidates(auth.org.id, filters) });
});

export const POST = withAuth(async (request, { auth }) => {
  const input = await parseBody(request, candidateSchema);
  const candidate = createCandidate(auth.org.id, auth.user.id, input);
  return json({ candidate }, { status: 201 });
});
