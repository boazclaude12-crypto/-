import { z } from 'zod';
import { getDb } from '@/lib/db/index';
import { json, parseQuery, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).optional().default(30) });

/** What the last syncs did with each message, so nothing is unaccounted for. */
export const GET = withAuth(async (request, { auth }) => {
  const { limit } = parseQuery(request, querySchema);
  const messages = getDb().all(
    `SELECT m.id, m.subject, m.sender, m.received_at, m.status, m.job_title, m.reason,
            m.candidate_id, c.first_name, c.last_name
       FROM email_messages m
       LEFT JOIN candidates c ON c.id = m.candidate_id AND c.org_id = m.org_id
      WHERE m.org_id = ?
      ORDER BY m.created_at DESC
      LIMIT ?`,
    auth.org.id, limit,
  );
  return json({ messages });
});
