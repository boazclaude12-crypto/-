import { z } from 'zod';
import { importRows } from '@/lib/domain/candidate-import';
import { MAX_IMPORT_ROWS } from '@/lib/documents/tabular';
import { json, parseBody, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const FIELDS = [
  'first_name', 'last_name', 'full_name', 'phone', 'email', 'city', 'current_role',
  'years_experience', 'education', 'desired_salary', 'availability', 'max_commute_km',
  'has_car', 'notes', 'tags', 'skills', '',
] as const;

const schema = z.object({
  rows: z.array(z.array(z.string().max(500))).min(1).max(MAX_IMPORT_ROWS),
  mapping: z.record(z.string(), z.enum(FIELDS)),
});

/** Commits the reviewed rows, one verdict per row. */
export const POST = withAuth(async (request, { auth }) => {
  const { rows, mapping } = await parseBody(request, schema);
  const numeric: Record<number, (typeof FIELDS)[number]> = {};
  for (const [key, value] of Object.entries(mapping)) numeric[Number(key)] = value;

  const result = importRows(auth.org.id, auth.user.id, rows, numeric);
  return json(result, { status: 201 });
}, { limit: 10, windowMs: 60_000 });
