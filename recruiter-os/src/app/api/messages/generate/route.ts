import { generateMessageSchema } from '@/lib/schemas';
import { repos } from '@/lib/db/repos';
import { getAiProvider } from '@/lib/ai/index';
import { json, notFound, parseBody, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth(async (request, { auth }) => {
  const input = await parseBody(request, generateMessageSchema);
  const candidate = repos.candidates.find(auth.org.id, input.candidate_id);
  if (!candidate) throw notFound('מועמד לא נמצא');

  const job = input.job_id ? repos.jobs.find(auth.org.id, input.job_id) : undefined;
  const client = job?.client_id ? repos.clients.find(auth.org.id, job.client_id) : undefined;
  const highlights = job
    ? repos.jobRequirements
        .list(auth.org.id, { where: 'job_id = ? AND is_required = 0', params: [job.id], limit: 3 })
        .map((requirement) => requirement.value)
    : [];

  const generated = await getAiProvider().generateMessage({
    tone: input.tone,
    channel: input.channel,
    candidate: {
      name: `${candidate.first_name} ${candidate.last_name}`.trim(),
      current_role: candidate.current_role,
      city: candidate.city,
      years_experience: candidate.years_experience,
    },
    job: job
      ? {
          title: job.title,
          city: job.city,
          salary_min: job.salary_min,
          salary_max: job.salary_max,
          salary_period: job.salary_period,
          employment_type: job.employment_type,
          client_name: client?.name ?? null,
          highlights,
        }
      : null,
    recruiter: { name: auth.user.name },
  });

  return json(generated);
}, { limit: 60, windowMs: 60_000 });
