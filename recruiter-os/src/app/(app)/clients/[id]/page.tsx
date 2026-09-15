import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth/server';
import { getClientDetail } from '@/lib/domain/clients';
import { stagesFor } from '@/lib/domain/applications';
import { listTasks } from '@/lib/domain/tasks';
import { Badge, Card, EmptyState, LinkButton, StatCard, Table, Td, Th } from '@/components/ui';
import { Icon } from '@/components/ui/icons';
import { ClientActions } from '@/components/app/ClientActions';
import { Timeline } from '@/components/app/Timeline';
import { TaskChecklist } from '@/components/app/TaskChecklist';
import { NoteComposer } from '@/components/app/DocumentPanel';
import {
  CLIENT_STATUSES, colorOf, JOB_STATUSES, labelOf, PAYMENT_STATUSES, PLACEMENT_STATUSES,
} from '@/lib/domain/constants';
import { displayPhone, formatDate, formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ClientDetailPage({ params }: PageProps) {
  const auth = await requireAuth();
  const { id } = await params;

  const detail = getClientDetail(auth.org.id, id);
  if (!detail) notFound();

  const { client } = detail;
  const stages = stagesFor(auth.org.id);
  const tasks = listTasks(auth.org.id, { clientId: id, status: 'open', limit: 8 });

  const formValues = {
    name: client.name,
    industry: client.industry ?? '',
    city: client.city ?? '',
    address: client.address ?? '',
    phone: client.phone ?? '',
    email: client.email ?? '',
    website: client.website ?? '',
    status: client.status,
    fee_type: client.fee_type,
    fee_value: String(client.fee_value),
    payment_terms_days: String(client.payment_terms_days),
    notes: client.notes ?? '',
    contacts: detail.contacts.map((contact) => ({
      name: contact.name,
      role: contact.role ?? '',
      phone: contact.phone ?? '',
      email: contact.email ?? '',
      is_primary: contact.is_primary === 1,
    })),
  };

  return (
    <div className="space-y-4">
      <Link href="/clients" className="inline-flex items-center gap-1 text-sm text-muted hover:text-brand">
        <Icon.ArrowRight size={15} /> כל הלקוחות
      </Link>

      <header className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">{client.name}</h1>
              <Badge tone={colorOf(CLIENT_STATUSES, client.status)}>
                {labelOf(CLIENT_STATUSES, client.status)}
              </Badge>
            </div>
            <p className="mt-0.5 text-sm text-muted">
              {[client.industry, client.city, displayPhone(client.phone)].filter(Boolean).join(' · ') || '—'}
            </p>
            <p className="mt-0.5 text-xs text-faint">
              עמלה: {client.fee_type === 'percent' ? `${client.fee_value}% משכר` : formatMoney(client.fee_value)}
              {' · '}שוטף + {client.payment_terms_days}
            </p>
          </div>
        </div>

        <div className="mt-4 border-t border-line pt-4">
          <ClientActions clientId={client.id} clientName={client.name} formValues={formValues} />
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="משרות פתוחות" value={client.open_jobs} />
        <StatCard label="מועמדים בתהליך" value={client.active_candidates} />
        <StatCard label="השמות" value={client.placements} tone="ok" />
        <StatCard
          label="הכנסה מהלקוח"
          value={formatMoney(client.revenue_paid)}
          sub={client.revenue_pending > 0 ? `${formatMoney(client.revenue_pending)} בגבייה` : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card
            title="משרות"
            action={
              <LinkButton href="/jobs/new" size="sm" variant="subtle" icon={<Icon.Plus size={14} />}>
                משרה חדשה
              </LinkButton>
            }
            bodyClassName="p-0"
          >
            {detail.jobs.length === 0 ? (
              <EmptyState title="אין משרות ללקוח זה" />
            ) : (
              <Table>
                <thead className="hairline">
                  <tr>
                    <Th>משרה</Th>
                    <Th>סטטוס</Th>
                    <Th>מועמדים</Th>
                    <Th className="hidden sm:table-cell">נפתחה</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {detail.jobs.map((job) => (
                    <tr key={job.id}>
                      <Td>
                        <Link href={`/jobs/${job.id}`} className="font-medium text-ink hover:text-brand">
                          {job.title}
                        </Link>
                      </Td>
                      <Td>
                        <Badge tone={colorOf(JOB_STATUSES, job.status)}>{labelOf(JOB_STATUSES, job.status)}</Badge>
                      </Td>
                      <Td>
                        <span className="num text-sm text-muted">{job.active_candidates}</span>
                      </Td>
                      <Td className="hidden sm:table-cell">
                        <span className="text-xs text-faint">{formatDate(job.opened_at)}</span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          {detail.placements.length > 0 && (
            <Card title="השמות" bodyClassName="p-0">
              <Table>
                <thead className="hairline">
                  <tr>
                    <Th>מועמד</Th>
                    <Th className="hidden sm:table-cell">משרה</Th>
                    <Th>התחלה</Th>
                    <Th>עמלה</Th>
                    <Th>סטטוס</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {detail.placements.map((placement) => (
                    <tr key={placement.id}>
                      <Td>{placement.candidate_name}</Td>
                      <Td className="hidden sm:table-cell">
                        <span className="text-sm text-muted">{placement.job_title}</span>
                      </Td>
                      <Td>
                        <span className="num text-sm">{formatDate(placement.start_date)}</span>
                      </Td>
                      <Td>
                        <span className="num text-sm font-medium">{formatMoney(placement.fee_amount)}</span>
                      </Td>
                      <Td>
                        <Badge tone={colorOf(PLACEMENT_STATUSES, placement.status)}>
                          {labelOf(PLACEMENT_STATUSES, placement.status)}
                        </Badge>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}

          <Card title="ציר זמן ותקשורת" bodyClassName="p-0">
            <div className="border-b border-line p-4">
              <NoteComposer clientId={client.id} />
            </div>
            <Timeline entries={detail.timeline} />
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="אנשי קשר">
            {detail.contacts.length === 0 ? (
              <p className="text-sm text-muted">לא הוזנו אנשי קשר.</p>
            ) : (
              <ul className="space-y-3">
                {detail.contacts.map((contact) => (
                  <li key={contact.id}>
                    <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      {contact.name}
                      {contact.is_primary === 1 && <Badge tone="brand">ראשי</Badge>}
                    </p>
                    {contact.role && <p className="text-xs text-muted">{contact.role}</p>}
                    {contact.phone && (
                      <a
                        href={`tel:${contact.phone}`}
                        className="num block text-xs text-brand hover:underline"
                        dir="ltr"
                      >
                        {displayPhone(contact.phone)}
                      </a>
                    )}
                    {contact.email && (
                      <a href={`mailto:${contact.email}`} className="block text-xs text-brand hover:underline" dir="ltr">
                        {contact.email}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {detail.pipeline.length > 0 && (
            <Card title="מועמדים לפי שלב">
              <ul className="space-y-1.5">
                {detail.pipeline.map((row) => {
                  const stage = stages.find((item) => item.key === row.stage_key);
                  return (
                    <li key={row.stage_key} className="flex items-center justify-between gap-2">
                      <Badge tone={stage?.color ?? 'slate'}>{stage?.label ?? row.stage_key}</Badge>
                      <span className="num text-sm text-ink">{row.count}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {detail.payments.length > 0 && (
            <Card title="תשלומים" bodyClassName="p-0">
              <ul className="divide-y divide-line">
                {detail.payments.map((payment) => (
                  <li key={payment.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <span>
                      <span className="num block text-sm font-medium text-ink">
                        {formatMoney(payment.amount)}
                      </span>
                      <span className="block text-xs text-faint">
                        {payment.due_date ? `יעד ${formatDate(payment.due_date)}` : 'ללא תאריך יעד'}
                      </span>
                    </span>
                    <Badge tone={colorOf(PAYMENT_STATUSES, payment.status)}>
                      {labelOf(PAYMENT_STATUSES, payment.status)}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {client.notes && (
            <Card title="הערות">
              <p className="whitespace-pre-wrap text-sm text-muted">{client.notes}</p>
            </Card>
          )}

          {tasks.length > 0 && (
            <Card title="משימות" bodyClassName="p-0">
              <TaskChecklist tasks={tasks} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
