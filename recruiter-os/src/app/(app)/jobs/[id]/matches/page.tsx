import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth/server';
import { getJobDetail } from '@/lib/domain/jobs';
import { matchCandidatesForJob } from '@/lib/matching/service';
import { Badge, Card } from '@/components/ui';
import { Icon } from '@/components/ui/icons';
import { MatchList } from '@/components/app/MatchList';
import { salaryRange } from '@/lib/format';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function JobMatchesPage({ params, searchParams }: PageProps) {
  const auth = await requireAuth();
  const { id } = await params;
  const query = await searchParams;

  const detail = getJobDetail(auth.org.id, id);
  if (!detail) notFound();

  const minScore = Number(Array.isArray(query.min) ? query.min[0] : query.min) || 0;
  const matches = matchCandidatesForJob(auth.org.id, id, { limit: 50, minScore });

  return (
    <div className="space-y-4">
      <Link href={`/jobs/${id}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-brand">
        <Icon.ArrowRight size={15} /> חזרה למשרה
      </Link>

      <header>
        <h1 className="text-xl font-semibold text-ink">מועמדים מתאימים — {detail.job.title}</h1>
        <p className="text-sm text-muted">
          {[detail.job.client_name, detail.job.city, salaryRange(detail.job.salary_min, detail.job.salary_max, detail.job.salary_period)]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {detail.requirements.map((requirement) => (
            <Badge key={requirement.id} tone={requirement.is_required ? 'rose' : 'slate'}>
              {requirement.value}
            </Badge>
          ))}
          {detail.requirements.length === 0 && (
            <span className="text-xs text-warn">
              למשרה לא הוגדרו דרישות — הציון מבוסס על תפקיד, מיקום וזמינות בלבד.
            </span>
          )}
        </div>
      </header>

      <Card bodyClassName="p-0">
        <MatchList jobId={id} matches={matches} initialMinScore={minScore} />
      </Card>
    </div>
  );
}
