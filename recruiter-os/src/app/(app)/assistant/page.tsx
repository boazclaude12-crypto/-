import { requireAuth } from '@/lib/auth/server';
import { aiStatus } from '@/lib/ai/index';
import { CHAT_SUGGESTIONS } from '@/lib/ai/chat';
import { AssistantChat } from '@/components/app/AssistantChat';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'עוזר AI — Recruiter OS' };

export default async function AssistantPage() {
  await requireAuth();
  const status = aiStatus();

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <header>
        <h1 className="text-xl font-semibold text-ink">עוזר הגיוס</h1>
        <p className="text-sm text-muted">
          {status.provider === 'anthropic'
            ? `התשובות מנוסחות על ידי ${status.model} על בסיס הנתונים שלך בלבד.`
            : 'פועל על המנוע המקומי — התשובות מגיעות ישירות מהנתונים שלך, ללא שירות חיצוני.'}
        </p>
      </header>
      <AssistantChat suggestions={CHAT_SUGGESTIONS} providerName={status.provider} />
    </div>
  );
}
