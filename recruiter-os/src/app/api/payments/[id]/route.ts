import { paymentUpdateSchema } from '@/lib/schemas';
import { deletePayment, updatePayment } from '@/lib/domain/payments';
import { json, notFound, parseBody, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = withAuth<{ id: string }>(async (request, { auth, params }) => {
  const input = await parseBody(request, paymentUpdateSchema);
  const payment = updatePayment(auth.org.id, auth.user.id, params.id, input);
  if (!payment) throw notFound('תשלום לא נמצא');
  return json({ payment });
});

export const DELETE = withAuth<{ id: string }>(async (_request, { auth, params }) => {
  if (!deletePayment(auth.org.id, params.id)) throw notFound('תשלום לא נמצא');
  return new Response(null, { status: 204 });
});
