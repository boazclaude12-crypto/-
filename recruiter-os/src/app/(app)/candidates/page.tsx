import Link from 'next/link';
import { requireAuth } from '@/lib/auth/server';
import { listCandidates } from '@/lib/domain/candidates';
import { stagesFor } from '@/lib/domain/applications';
import { tagsWithCounts } from '@/lib/domain/tags';
import { Avatar, Badge, Card, EmptyState, LinkButton, Table, Td, Th } from '@/components/ui';
import { Icon } from '@/components/ui/icons';
import { FilterBar } from '@/components/app/FilterBar';
import { AVAILABILITY, labelOf, REGIONS } from '@/lib/domain/constants';
import { displayPhone, relativeTime } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'מועמדים — Recruiter OS' };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CandidatesPage({ searchParams }: PageProps) {
  const auth = await requireAuth();
  const params = await searchParams;

  const filters = {
    q: first(params.q),
    status: first(params.status),
    region: first(params.region),
    availability: first(params.availability),
    tag: first(params.tag),
    limit: 100,
  };

  const candidates = listCandidates(auth.org.id, filters);
  const stages = stagesFor(auth.org.id);
  const tags = tagsWithCounts(auth.org.id).slice(0, 20);
  const stageByKey = new Map(stages.map((stage) => [stage.key, stage]));

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">מועמדים</h1>
          <p className="text-sm text-muted">
            {candidates.length === 100 ? '100+ תוצאות' : `${candidates.length} תוצאות`}
          </p>
        </div>
        <LinkButton href="/candidates/new" icon={<Icon.Plus size={16} />}>
          מועמד חדש
        </LinkButton>
      </header>

      <FilterBar
        searchPlaceholder='חיפוש לפי שם, טלפון, עיר, רישיון… (למשל "C חיפה")'
        filters={[
          { key: 'status', label: 'סטטוס', options: stages.map((s) => ({ value: s.key, label: s.label })) },
          { key: 'region', label: 'אזור', options: REGIONS },
          { key: 'availability', label: 'זמינות', options: AVAILABILITY },
          { key: 'tag', label: 'תגית', options: tags.map((t) => ({ value: t.name, label: `#${t.name}` })) },
        ]}
      />

      <Card bodyClassName="p-0">
        {candidates.length === 0 ? (
          <EmptyState
            icon={<Icon.Users size={28} />}
            title="לא נמצאו מועמדים"
            description="אפשר לשנות את הסינון, או להוסיף מועמד חדש — ידנית או מקורות חיים."
            action={<LinkButton href="/candidates/new" size="sm">הוספת מועמד</LinkButton>}
          />
        ) : (
          <Table>
            <thead className="hairline">
              <tr>
                <Th>מועמד</Th>
                <Th className="hidden md:table-cell">תפקיד</Th>
                <Th className="hidden sm:table-cell">אזור</Th>
                <Th>סטטוס</Th>
                <Th className="hidden lg:table-cell">זמינות</Th>
                <Th className="hidden lg:table-cell">תגיות</Th>
                <Th className="hidden sm:table-cell">עודכן</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {candidates.map((candidate) => {
                const stage = stageByKey.get(candidate.status_key);
                const name = `${candidate.first_name} ${candidate.last_name}`.trim();
                const tagNames = candidate.tag_names?.split(',').filter(Boolean) ?? [];
                return (
                  <tr key={candidate.id} className="transition hover:bg-brand-soft/40">
                    <Td>
                      <Link href={`/candidates/${candidate.id}`} className="flex items-center gap-2.5">
                        <Avatar name={name} size={34} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink">{name}</span>
                          <span className="num block truncate text-xs text-faint" dir="ltr">
                            {displayPhone(candidate.phone)}
                          </span>
                        </span>
                      </Link>
                    </Td>
                    <Td className="hidden md:table-cell">
                      <span className="text-sm text-muted">{candidate.current_role ?? '—'}</span>
                    </Td>
                    <Td className="hidden sm:table-cell">
                      <span className="text-sm text-muted">
                        {candidate.city ?? labelOf(REGIONS, candidate.region, '—')}
                      </span>
                    </Td>
                    <Td>
                      <Badge tone={stage?.color ?? 'slate'}>{stage?.label ?? candidate.status_key}</Badge>
                    </Td>
                    <Td className="hidden lg:table-cell">
                      <span className="text-sm text-muted">
                        {labelOf(AVAILABILITY, candidate.availability, '—')}
                      </span>
                    </Td>
                    <Td className="hidden lg:table-cell">
                      <span className="flex flex-wrap gap-1">
                        {tagNames.slice(0, 2).map((tag) => (
                          <Badge key={tag} tone="brand">#{tag}</Badge>
                        ))}
                        {tagNames.length > 2 && (
                          <span className="text-xs text-faint">+{tagNames.length - 2}</span>
                        )}
                      </span>
                    </Td>
                    <Td className="hidden sm:table-cell">
                      <span className="text-xs text-faint">{relativeTime(candidate.updated_at)}</span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
