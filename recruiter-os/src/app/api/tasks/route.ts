import { z } from 'zod';
import { taskSchema } from '@/lib/schemas';
import { createTask, listTasks } from '@/lib/domain/tasks';
import { json, parseBody, parseQuery, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  status: z.enum(['open', 'done', 'cancelled', 'all']).optional(),
  scope: z.enum(['today', 'overdue', 'week', 'all']).optional(),
  candidateId: z.string().max(60).optional(),
  clientId: z.string().max(60).optional(),
  jobId: z.string().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const GET = withAuth(async (request, { auth }) =>
  json({ tasks: listTasks(auth.org.id, parseQuery(request, querySchema)) }),
);

export const POST = withAuth(async (request, { auth }) => {
  const input = await parseBody(request, taskSchema);
  const task = createTask(auth.org.id, auth.user.id, input);
  return json({ task }, { status: 201 });
});
