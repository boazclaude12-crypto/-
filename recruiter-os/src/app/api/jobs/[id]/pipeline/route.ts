import { pipelineForJob, pipelineStages } from '@/lib/domain/applications';
import { json, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<{ id: string }>(async (_request, { auth, params }) =>
  json({ stages: pipelineStages(auth.org.id), cards: pipelineForJob(auth.org.id, params.id) }),
);
