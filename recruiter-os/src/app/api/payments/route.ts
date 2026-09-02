import { z } from 'zod';
import { paymentSchema } from '@/lib/schemas';
import { createPayment, listPayments, refreshOverdue } from '@/lib/domain/payments';
import { json, parseBody, parseQuery, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  status: z.string().max(20).optional(),
  clientId: z.string().max(60).optional(),
  from: z.string().max(30).optional(),
  to: z.string().max(30).optional(),
  limit: z.coerce.number().int().min(1).max(300).optional(),
});

export const GET = withAuth(async (request, { auth }) => {
  refreshOverdue(auth.org.id);
  return json({ payments: listPayments(auth.org.id, parseQuery(request, querySchema)) });
});

export const POST = withAuth(async (request, { auth }) => {
  const input = await parseBody(request, paymentSchema);
  return json({ payment: createPayment(auth.org.id, auth.user.id, input) }, { status: 201 });
});
