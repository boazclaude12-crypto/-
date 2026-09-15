import { z } from 'zod';
import { interviewSchema } from '@/lib/schemas';
import { listInterviews, scheduleInterview } from '@/lib/domain/interviews';
import { json, parseBody, parseQuery, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
  status: z.string().max(20).optional(),
  candidateId: z.string().max(60).optional(),
  jobId: z.string().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const GET = withAuth(async (request, { auth }) =>
  json({ interviews: listInterviews(auth.org.id, parseQuery(request, querySchema)) }),
);

export const POST = withAuth(async (request, { auth }) => {
  const input = await parseBody(request, interviewSchema);
  const interview = scheduleInterview(auth.org.id, auth.user.id, input);
  return json({ interview }, { status: 201 });
});
