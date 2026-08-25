import { automationUpdateSchema } from '@/lib/schemas';
import { repos } from '@/lib/db/repos';
import { json, notFound, parseBody, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = withAuth<{ id: string }>(async (request, { auth, params }) => {
  const input = await parseBody(request, automationUpdateSchema);
  const values: Record<string, string | number | null> = {};
  if (input.is_enabled !== undefined) values.is_enabled = input.is_enabled ? 1 : 0;
  if (input.name) values.name = input.name;
  if (input.description !== undefined) values.description = input.description;
  if (input.delay_minutes !== undefined) values.delay_minutes = input.delay_minutes;
  if (input.action_config) values.action_config = JSON.stringify(input.action_config);

  const automation = repos.automations.update(auth.org.id, params.id, values);
  if (!automation) throw notFound('אוטומציה לא נמצאה');
  return json({ automation });
});
