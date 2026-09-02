import Link from 'next/link';
import { requireAuth } from '@/lib/auth/server';
import { getAnalytics } from '@/lib/domain/analytics';
import { Card, StatCard, Table, Td, Th } from '@/components/ui';
import { AnalyticsCharts } from '@/components/app/AnalyticsCharts';
import { formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'נתונים — Recruiter OS' };

export default async function AnalyticsPage() {
  const auth = await requireAuth();
  const data = getAnalytics(auth.org.id, 6);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-ink">נתונים</h1>
        <p className="text-sm text-muted">כל המספרים מחושבים מהנתונים שלך בלבד — אין הערכות.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="מועמדים במאגר" value={data.totals.candidates} href="/candidates" />
        <StatCard
          label="משרות"
          value={data.totals.jobs}
          sub={`${data.totals.openJobs} פתוחות`}
          href="/jobs"
        />
        <StatCard label="לקוחות" value={data.totals.clients} href="/clients" />
        <StatCard label="השמות" value={data.totals.placements} tone="ok" href="/money" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="שיעור הצלחה"
          value={`${data.rates.successRate}%`}
          sub="שיוך → השמה"
        />
        <StatCard
          label="מועמד → ראיון"
          value={`${data.rates.candidateToInterview}%`}
        />
        <StatCard
          label="ראיון → השמה"
          value={`${data.rates.interviewToPlacement}%`}
        />
        <StatCard
          label="זמן ממוצע לסגירת משרה"
          value={data.rates.avgDaysToFill != null ? `${data.rates.avgDaysToFill} ימים` : '—'}
          sub={
            data.rates.avgDaysToFirstContact != null
              ? `${data.rates.avgDaysToFirstContact} ימים למגע ראשון`
              : undefined
          }
        />
      </div>

      <AnalyticsCharts data={data} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="הכנסה לפי לקוח" bodyClassName="p-0">
          {data.revenueByClient.length === 0 ? (
            <p className="py-8 text-center text-sm text-faint">אין עדיין הכנסות רשומות</p>
          ) : (
            <Table className="min-w-[420px]">
              <thead className="hairline">
                <tr>
                  <Th>לקוח</Th>
                  <Th>התקבל</Th>
                  <Th>בגבייה</Th>
                  <Th>השמות</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.revenueByClient.map((row) => (
                  <tr key={row.client_id}>
                    <Td>
                      <Link href={`/clients/${row.client_id}`} className="font-medium text-ink hover:text-brand">
                        {row.client_name}
                      </Link>
                    </Td>
                    <Td>
                      <span className="num text-sm text-ok">{formatMoney(row.received)}</span>
                    </Td>
                    <Td>
                      <span className="num text-sm text-muted">{formatMoney(row.pending)}</span>
                    </Td>
                    <Td>
                      <span className="num text-sm text-muted">{row.placements}</span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card title="משרות לפי היקף פעילות" bodyClassName="p-0">
          {data.topJobs.length === 0 ? (
            <p className="py-8 text-center text-sm text-faint">אין עדיין משרות</p>
          ) : (
            <Table className="min-w-[420px]">
              <thead className="hairline">
                <tr>
                  <Th>משרה</Th>
                  <Th>מועמדים</Th>
                  <Th>השמות</Th>
                  <Th>ימים</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.topJobs.map((row) => (
                  <tr key={row.id}>
                    <Td>
                      <Link href={`/jobs/${row.id}`} className="font-medium text-ink hover:text-brand">
                        {row.title}
                      </Link>
                    </Td>
                    <Td>
                      <span className="num text-sm text-muted">{row.applications}</span>
                    </Td>
                    <Td>
                      <span className="num text-sm text-ok">{row.placements}</span>
                    </Td>
                    <Td>
                      <span className="num text-sm text-muted">{row.days_open}</span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
