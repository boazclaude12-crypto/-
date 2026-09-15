import { requireAuth } from '@/lib/auth/server';
import { NewCandidateFlow } from '@/components/app/NewCandidateFlow';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'מועמד חדש — Recruiter OS' };

export default async function NewCandidatePage() {
  await requireAuth();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-ink">מועמד חדש</h1>
        <p className="text-sm text-muted">העלה קורות חיים והמערכת תמלא את הפרטים, או הזן ידנית.</p>
      </header>
      <NewCandidateFlow />
    </div>
  );
}
