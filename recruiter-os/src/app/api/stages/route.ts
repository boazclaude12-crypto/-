import { stageSchema } from '@/lib/schemas';
import { repos } from '@/lib/db/repos';
import { stagesFor } from '@/lib/domain/applications';
import { ApiError, json, parseBody, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth(async (_request, { auth }) => json({ stages: stagesFor(auth.org.id) }));

export const POST = withAuth(async (request, { auth }) => {
  const input = await parseBody(request, stageSchema);
  if (repos.stages.findBy(auth.org.id, 'key = ?', input.key)) {
    throw new ApiError(409, 'קיים כבר שלב עם המפתח הזה');
  }
  const existing = stagesFor(auth.org.id);
  const stage = repos.stages.create(auth.org.id, {
    key: input.key,
    label: input.label,
    color: input.color ?? 'slate',
    in_pipeline: input.in_pipeline === false ? 0 : 1,
    is_terminal: input.is_terminal ? 1 : 0,
    outcome: input.outcome ?? 'neutral',
    sort_order: input.sort_order ?? existing.length,
    is_system: 0,
  });
  return json({ stage }, { status: 201 });
});
