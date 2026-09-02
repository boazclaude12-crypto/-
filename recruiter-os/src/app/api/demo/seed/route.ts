import { hasData, seedDemoData } from '@/lib/seed/demo';
import { ApiError, json, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Loads demo data into the signed-in organisation, refusing if it already has records. */
export const POST = withAuth(async (_request, { auth }) => {
  if (hasData(auth.org.id)) {
    throw new ApiError(409, 'החשבון כבר מכיל נתונים. אפשר לטעון דמו רק לחשבון ריק.');
  }
  const result = seedDemoData(auth.org.id, auth.user.id);
  return json({ seeded: result }, { status: 201 });
}, { limit: 5, windowMs: 60 * 60_000 });
