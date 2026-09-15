import { chatSchema } from '@/lib/schemas';
import { askRecruiterChat } from '@/lib/ai/chat';
import { json, parseBody, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth(async (request, { auth }) => {
  const input = await parseBody(request, chatSchema);
  const reply = await askRecruiterChat(auth.org.id, auth.user.name, input.message, input.history);
  return json(reply);
}, { limit: 60, windowMs: 60_000 });
