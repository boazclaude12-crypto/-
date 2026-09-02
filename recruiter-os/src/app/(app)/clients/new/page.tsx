import { requireAuth } from '@/lib/auth/server';
import { Card } from '@/components/ui';
import { NewClientForm } from '@/components/app/NewEntityForms';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'לקוח חדש — Recruiter OS' };

export default async function NewClientPage() {
  await requireAuth();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-ink">לקוח חדש</h1>
        <p className="text-sm text-muted">הגדרת עמלה ותנאי תשלום כאן תחסוך הזנה חוזרת בכל השמה.</p>
      </header>
      <Card>
        <NewClientForm />
      </Card>
    </div>
  );
}
