import { searchSchema } from '@/lib/schemas';
import { globalSearch } from '@/lib/domain/search';
import { json, parseQuery, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth(async (request, { auth }) => {
  const { q, limit } = parseQuery(request, searchSchema);
  return json(globalSearch(auth.org.id, q, limit));
}, { limit: 600 });
