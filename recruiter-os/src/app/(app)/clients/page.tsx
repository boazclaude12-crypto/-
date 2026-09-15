import Link from 'next/link';
import { requireAuth } from '@/lib/auth/server';
import { listClients } from '@/lib/domain/clients';
import { Badge, Card, EmptyState, LinkButton, Table, Td, Th } from '@/components/ui';
import { Icon } from '@/components/ui/icons';
import { FilterBar } from '@/components/app/FilterBar';
import { CLIENT_STATUSES, colorOf, labelOf } from '@/lib/domain/constants';
import { displayPhone, formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'לקוחות — Recruiter OS' };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ClientsPage({ searchParams }: PageProps) {
  const auth = await requireAuth();
  const params = await searchParams;

  const clients = listClients(auth.org.id, {
    q: first(params.q),
    status: first(params.status),
    limit: 100,
  });

  const totalRevenue = clients.reduce((sum, client) => sum + client.revenue_paid, 0);
  const totalPending = clients.reduce((sum, client) => sum + client.revenue_pending, 0);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">לקוחות</h1>
          <p className="text-sm text-muted">
            {clients.length} לקוחות · {formatMoney(totalRevenue)} התקבל · {formatMoney(totalPending)} בגבייה
          </p>
        </div>
        <LinkButton href="/clients/new" icon={<Icon.Plus size={16} />}>
          לקוח חדש
        </LinkButton>
      </header>

      <FilterBar
        searchPlaceholder="חיפוש לפי שם, עיר או תחום…"
        filters={[{ key: 'status', label: 'סטטוס', options: CLIENT_STATUSES }]}
      />

      <Card bodyClassName="p-0">
        {clients.length === 0 ? (
          <EmptyState
            icon={<Icon.Building size={28} />}
            title="אין לקוחות עדיין"
            description="הוסף לקוח כדי לקשר אליו משרות, לעקוב אחרי מועמדים שנשלחו ולנהל את העמלות."
            action={<LinkButton href="/clients/new" size="sm">הוספת לקוח</LinkButton>}
          />
        ) : (
          <Table>
            <thead className="hairline">
              <tr>
                <Th>לקוח</Th>
                <Th className="hidden md:table-cell">איש קשר</Th>
                <Th>סטטוס</Th>
                <Th>משרות פתוחות</Th>
                <Th className="hidden sm:table-cell">בתהליך</Th>
                <Th className="hidden sm:table-cell">השמות</Th>
                <Th>הכנסה</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {clients.map((client) => (
                <tr key={client.id} className="transition hover:bg-brand-soft/40">
                  <Td>
                    <Link href={`/clients/${client.id}`} className="block">
                      <span className="block font-medium text-ink">{client.name}</span>
                      <span className="block text-xs text-faint">
                        {[client.industry, client.city].filter(Boolean).join(' · ') || '—'}
                      </span>
                    </Link>
                  </Td>
                  <Td className="hidden md:table-cell">
                    <span className="block text-sm text-muted">{client.primary_contact ?? '—'}</span>
                    <span className="num block text-xs text-faint" dir="ltr">
                      {displayPhone(client.phone)}
                    </span>
                  </Td>
                  <Td>
                    <Badge tone={colorOf(CLIENT_STATUSES, client.status)}>
                      {labelOf(CLIENT_STATUSES, client.status)}
                    </Badge>
                  </Td>
                  <Td>
                    <span className="num text-sm font-medium text-ink">{client.open_jobs}</span>
                  </Td>
                  <Td className="hidden sm:table-cell">
                    <span className="num text-sm text-muted">{client.active_candidates}</span>
                  </Td>
                  <Td className="hidden sm:table-cell">
                    <span className="num text-sm text-muted">{client.placements}</span>
                  </Td>
                  <Td>
                    <span className="num block text-sm font-medium text-ok">
                      {formatMoney(client.revenue_paid)}
                    </span>
                    {client.revenue_pending > 0 && (
                      <span className="num block text-xs text-warn">
                        {formatMoney(client.revenue_pending)} בהמתנה
                      </span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
