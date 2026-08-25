import { matchQuerySchema } from '@/lib/schemas';
import { matchJobsForCandidate } from '@/lib/matching/service';
import { json, parseQuery, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<{ id: string }>(async (request, { auth, params }) => {
  const query = parseQuery(request, matchQuerySchema);
  return json({
    matches: matchJobsForCandidate(auth.org.id, params.id, {
      minScore: query.min_score,
      limit: query.limit,
    }),
  });
});
