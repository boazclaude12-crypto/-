import { z } from 'zod';
import { clientSchema } from '@/lib/schemas';
import { createClient, listClients } from '@/lib/domain/clients';
import { json, parseBody, parseQuery, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.string().trim().max(20).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const GET = withAuth(async (request, { auth }) => {
  const filters = parseQuery(request, querySchema);
  return json({ clients: listClients(auth.org.id, filters) });
});

export const POST = withAuth(async (request, { auth }) => {
  const input = await parseBody(request, clientSchema);
  const client = createClient(auth.org.id, auth.user.id, input);
  return json({ client }, { status: 201 });
});
