import { processDueRuns } from '@/lib/automations/engine';
import { json, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Executes automations whose delay has elapsed. The app calls this when the user opens
 * a screen; a cron job can hit the same endpoint for unattended processing.
 */
export const POST = withAuth(async (_request, { auth }) => json(processDueRuns(auth.org.id)));
