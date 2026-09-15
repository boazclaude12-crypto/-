import { jobUpdateSchema } from '@/lib/schemas';
import { deleteJob, getJobDetail, updateJob } from '@/lib/domain/jobs';
import { json, notFound, parseBody, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<{ id: string }>(async (_request, { auth, params }) => {
  const detail = getJobDetail(auth.org.id, params.id);
  if (!detail) throw notFound('משרה לא נמצאה');
  return json(detail);
});

export const PATCH = withAuth<{ id: string }>(async (request, { auth, params }) => {
  const input = await parseBody(request, jobUpdateSchema);
  const job = updateJob(auth.org.id, auth.user.id, params.id, input);
  if (!job) throw notFound('משרה לא נמצאה');
  return json({ job });
});

export const DELETE = withAuth<{ id: string }>(async (_request, { auth, params }) => {
  if (!deleteJob(auth.org.id, params.id)) throw notFound('משרה לא נמצאה');
  return new Response(null, { status: 204 });
});
