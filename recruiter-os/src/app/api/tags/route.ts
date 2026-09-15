import { tagsWithCounts } from '@/lib/domain/tags';
import { json, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth(async (_request, { auth }) => json({ tags: tagsWithCounts(auth.org.id) }));
