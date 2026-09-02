import { z } from 'zod';
import { messageSchema } from '@/lib/schemas';
import { createMessage, listMessages } from '@/lib/domain/messages';
import { json, parseBody, parseQuery, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  candidateId: z.string().max(60).optional(),
  clientId: z.string().max(60).optional(),
  status: z.string().max(20).optional(),
  channel: z.string().max(20).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const GET = withAuth(async (request, { auth }) =>
  json({ messages: listMessages(auth.org.id, parseQuery(request, querySchema)) }),
);

export const POST = withAuth(async (request, { auth }) => {
  const input = await parseBody(request, messageSchema);
  const result = await createMessage(auth.org.id, auth.user.id, input);
  return json(result, { status: 201 });
});
