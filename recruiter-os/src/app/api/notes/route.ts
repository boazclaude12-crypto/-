import { z } from 'zod';
import { noteSchema } from '@/lib/schemas';
import { createNote, listNotes } from '@/lib/domain/notes';
import { json, parseBody, parseQuery, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  candidateId: z.string().max(60).optional(),
  clientId: z.string().max(60).optional(),
  jobId: z.string().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const GET = withAuth(async (request, { auth }) =>
  json({ notes: listNotes(auth.org.id, parseQuery(request, querySchema)) }),
);

export const POST = withAuth(async (request, { auth }) => {
  const input = await parseBody(request, noteSchema);
  return json({ note: createNote(auth.org.id, auth.user.id, input) }, { status: 201 });
});
