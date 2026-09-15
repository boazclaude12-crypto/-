import { stageMoveSchema } from '@/lib/schemas';
import { moveApplicationStage } from '@/lib/domain/applications';
import { json, parseBody, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth<{ id: string }>(async (request, { auth, params }) => {
  const input = await parseBody(request, stageMoveSchema);
  const result = moveApplicationStage(auth.org.id, auth.user.id, params.id, input.stage_key, input.reason);
  return json(result);
});
