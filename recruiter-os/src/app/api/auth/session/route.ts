import { json, withAuth } from '@/lib/http';
import { orgStats } from '@/lib/auth/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth(async (_request, { auth }) =>
  json({ user: auth.user, org: auth.org, stats: orgStats(auth.org.id) }),
);
