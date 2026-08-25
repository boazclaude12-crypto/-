import { z } from 'zod';
import { matchCandidatesForJob } from '@/lib/matching/service';
import { json, parseQuery, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  min_score: z.coerce.number().min(0).max(100).optional().default(0),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  exclude_existing: z.coerce.boolean().optional().default(false),
});

export const GET = withAuth<{ id: string }>(async (request, { auth, params }) => {
  const query = parseQuery(request, querySchema);
  return json({
    matches: matchCandidatesForJob(auth.org.id, params.id, {
      minScore: query.min_score,
      limit: query.limit,
      excludeExisting: query.exclude_existing,
    }),
  });
});
