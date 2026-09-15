import { nextBestActions } from '@/lib/domain/next-best-action';
import { json, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth(async (_request, { auth }) =>
  json({ actions: nextBestActions(auth.org.id, 10) }),
);
