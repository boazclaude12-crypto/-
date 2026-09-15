import { z } from 'zod';
import { jobSchema } from '@/lib/schemas';
import { createJob, listJobs } from '@/lib/domain/jobs';
import { json, parseBody, parseQuery, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.string().trim().max(30).optional(),
  clientId: z.string().trim().max(60).optional(),
  priority: z.string().trim().max(20).optional(),
  tag: z.string().trim().max(40).optional(),
  activeOnly: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const GET = withAuth(async (request, { auth }) => {
  const filters = parseQuery(request, querySchema);
  return json({ jobs: listJobs(auth.org.id, filters) });
});

export const POST = withAuth(async (request, { auth }) => {
  const input = await parseBody(request, jobSchema);
  const job = createJob(auth.org.id, auth.user.id, input);
  return json({ job }, { status: 201 });
});
