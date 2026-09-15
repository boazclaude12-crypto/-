import { markStarted } from '@/lib/domain/placements';
import { json, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth<{ id: string }>(async (_request, { auth, params }) =>
  json({ placement: markStarted(auth.org.id, auth.user.id, params.id) }),
);
