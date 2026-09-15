import { requireAuth } from '@/lib/auth/server';
import { NewJobFlow } from '@/components/app/NewJobFlow';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'משרה חדשה — Recruiter OS' };

export default async function NewJobPage() {
  await requireAuth();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-ink">משרה חדשה</h1>
        <p className="text-sm text-muted">
          הדבק את המשרה כמו שקיבלת אותה, והמערכת תוציא ממנה את הדרישות שההתאמה מחשבת עליהן.
        </p>
      </header>
      <NewJobFlow />
    </div>
  );
}
