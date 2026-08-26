import { stageUpdateSchema } from '@/lib/schemas';
import { repos } from '@/lib/db/repos';
import { getDb } from '@/lib/db/index';
import { ApiError, json, notFound, parseBody, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = withAuth<{ id: string }>(async (request, { auth, params }) => {
  const input = await parseBody(request, stageUpdateSchema);
  const existing = repos.stages.find(auth.org.id, params.id);
  if (!existing) throw notFound('שלב לא נמצא');

  const values: Record<string, string | number | null> = {};
  if (input.label !== undefined) values.label = input.label;
  if (input.color !== undefined) values.color = input.color;
  if (input.in_pipeline !== undefined) values.in_pipeline = input.in_pipeline ? 1 : 0;
  if (input.is_terminal !== undefined) values.is_terminal = input.is_terminal ? 1 : 0;
  if (input.outcome !== undefined) values.outcome = input.outcome;
  if (input.sort_order !== undefined) values.sort_order = input.sort_order;

  return json({ stage: repos.stages.update(auth.org.id, params.id, values) });
});

/**
 * A stage can only be removed once nothing points at it — deleting one in use would
 * strand candidates and applications in a status that no longer exists.
 */
export const DELETE = withAuth<{ id: string }>(async (_request, { auth, params }) => {
  const stage = repos.stages.find(auth.org.id, params.id);
  if (!stage) throw notFound('שלב לא נמצא');

  const db = getDb();
  const inUse = db.get<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM candidates WHERE org_id = ? AND status_key = ?)
          + (SELECT COUNT(*) FROM applications WHERE org_id = ? AND stage_key = ?) AS n`,
    auth.org.id, stage.key, auth.org.id, stage.key,
  );
  if ((inUse?.n ?? 0) > 0) {
    throw new ApiError(409, `לא ניתן למחוק — ${inUse!.n} רשומות נמצאות בשלב הזה. העבר אותן לשלב אחר קודם.`);
  }
  if (repos.stages.count(auth.org.id) <= 2) {
    throw new ApiError(409, 'חייבים להישאר לפחות שני שלבים בפייפליין.');
  }

  repos.stages.remove(auth.org.id, params.id);
  return new Response(null, { status: 204 });
});
