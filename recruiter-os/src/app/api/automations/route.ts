import { repos } from '@/lib/db/repos';
import { json, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth(async (_request, { auth }) => {
  const automations = repos.automations.list(auth.org.id, { orderBy: 'created_at ASC' });
  const runs = repos.automationRuns.list(auth.org.id, { orderBy: 'created_at DESC', limit: 40 });
  return json({ automations, runs });
});
