import { requireAuth } from '@/lib/auth/server';
import { Card } from '@/components/ui';
import { NewJobForm } from '@/components/app/NewEntityForms';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'משרה חדשה — Recruiter OS' };

export default async function NewJobPage() {
  await requireAuth();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-ink">משרה חדשה</h1>
        <p className="text-sm text-muted">
          ככל שהדרישות מדויקות יותר, כך ההתאמה האוטומטית מהמאגר תהיה טובה יותר.
        </p>
      </header>
      <Card>
        <NewJobForm />
      </Card>
    </div>
  );
}
