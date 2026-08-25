import { applicationSchema } from '@/lib/schemas';
import { addCandidateToJob } from '@/lib/domain/applications';
import { json, parseBody, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth(async (request, { auth }) => {
  const input = await parseBody(request, applicationSchema);
  const application = addCandidateToJob(auth.org.id, auth.user.id, input);
  return json({ application }, { status: 201 });
});
