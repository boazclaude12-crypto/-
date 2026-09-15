import { taskUpdateSchema } from '@/lib/schemas';
import { deleteTask, updateTask } from '@/lib/domain/tasks';
import { json, notFound, parseBody, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = withAuth<{ id: string }>(async (request, { auth, params }) => {
  const input = await parseBody(request, taskUpdateSchema);
  const task = updateTask(auth.org.id, auth.user.id, params.id, input);
  if (!task) throw notFound('משימה לא נמצאה');
  return json({ task });
});

export const DELETE = withAuth<{ id: string }>(async (_request, { auth, params }) => {
  if (!deleteTask(auth.org.id, params.id)) throw notFound('משימה לא נמצאה');
  return new Response(null, { status: 204 });
});
