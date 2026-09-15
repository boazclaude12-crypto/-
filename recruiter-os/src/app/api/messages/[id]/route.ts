import { deleteMessage } from '@/lib/domain/messages';
import { notFound, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const DELETE = withAuth<{ id: string }>(async (_request, { auth, params }) => {
  if (!deleteMessage(auth.org.id, params.id)) throw notFound('הודעה לא נמצאה');
  return new Response(null, { status: 204 });
});
