import { interviewUpdateSchema } from '@/lib/schemas';
import { cancelInterview, updateInterview } from '@/lib/domain/interviews';
import { json, notFound, parseBody, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = withAuth<{ id: string }>(async (request, { auth, params }) => {
  const input = await parseBody(request, interviewUpdateSchema);
  const interview = updateInterview(auth.org.id, auth.user.id, params.id, input);
  if (!interview) throw notFound('ראיון לא נמצא');
  return json({ interview });
});

export const DELETE = withAuth<{ id: string }>(async (_request, { auth, params }) => {
  if (!cancelInterview(auth.org.id, params.id)) throw notFound('ראיון לא נמצא');
  return new Response(null, { status: 204 });
});
