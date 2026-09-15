import { z } from 'zod';
import { parseJobText } from '@/lib/ai/job-parser';
import { json, parseBody, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ text: z.string().trim().min(10).max(8000) });

/**
 * Reads a pasted job description into a filled-in form.
 *
 * Nothing is saved: the recruiter sees what was understood and corrects it before the
 * job exists, so a misread never becomes a record nobody noticed.
 */
export const POST = withAuth(async (request) => {
  const { text } = await parseBody(request, schema);
  return json({ job: parseJobText(text) });
}, { limit: 30, windowMs: 60_000 });
