import { requireAuth } from '@/lib/auth/server';
import { listPlacements } from '@/lib/domain/placements';
import { listPayments, refreshOverdue, revenueForPeriod, revenueThisMonth } from '@/lib/domain/payments';
import { getDb } from '@/lib/db/index';
import { Card, StatCard } from '@/components/ui';
import { MoneyTables } from '@/components/app/MoneyTables';
import { formatMoney } from '@/lib/format';
import { dateOnly, startOfMonth } from '@/lib/time';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'כספים — Recruiter OS' };

export default async function MoneyPage() {
  const auth = await requireAuth();
  const orgId = auth.org.id;

  refreshOverdue(orgId);

  const month = revenueThisMonth(orgId);
  const placements = listPlacements(orgId, { limit: 100 });
  const payments = listPayments(orgId, { limit: 200 });

  const previousMonthStart = new Date();
  previousMonthStart.setMonth(previousMonthStart.getMonth() - 1);
  const lastMonth = revenueForPeriod(
    orgId,
    dateOnly(startOfMonth(previousMonthStart)),
    dateOnly(new Date(new Date().getFullYear(), new Date().getMonth(), 0)),
  );

  const outstanding = getDb().get<{ total: number; count: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM payments
      WHERE org_id = ? AND status IN ('expected','invoiced','overdue')`,
    orgId,
  );

  const guaranteeAtRisk = placements.filter((placement) => placement.status === 'guarantee').length;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-ink">כספים</h1>
        <p className="text-sm text-muted">
          כל השמה, העמלה שלה, ומה שעוד לא נגבה — במקום אחד.
        </p>
      </header>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted">החודש</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="הכנסה צפויה"
            value={formatMoney(month.expected)}
            sub={lastMonth.expected > 0 ? `חודש קודם ${formatMoney(lastMonth.expected)}` : undefined}
          />
          <StatCard label="התקבל" value={formatMoney(month.received)} tone="ok" />
          <StatCard
            label="ממתין"
            value={formatMoney(month.pending)}
            sub={month.overdue > 0 ? `${formatMoney(month.overdue)} באיחור` : undefined}
            tone={month.overdue > 0 ? 'warn' : undefined}
          />
          <StatCard label="השמות" value={month.placements} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted">מצטבר</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="פתוח לגבייה"
            value={formatMoney(outstanding?.total ?? 0)}
            sub={`${outstanding?.count ?? 0} תשלומים`}
            tone={(outstanding?.total ?? 0) > 0 ? 'warn' : undefined}
          />
          <StatCard label="סה״כ השמות" value={placements.length} />
          <StatCard
            label="בתקופת אחריות"
            value={guaranteeAtRisk}
            sub="השמות שעדיין באחריות"
          />
          <StatCard
            label="עמלה ממוצעת"
            value={formatMoney(
              placements.length
                ? placements.reduce((sum, placement) => sum + placement.fee_amount, 0) / placements.length
                : 0,
            )}
          />
        </div>
      </section>

      <Card bodyClassName="p-0">
        <MoneyTables placements={placements} payments={payments} />
      </Card>
    </div>
  );
}
