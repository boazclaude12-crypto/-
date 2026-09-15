import { requireAuth } from '@/lib/auth/server';
import { listMessages } from '@/lib/domain/messages';
import { integrationStatus } from '@/lib/integrations/index';
import { getDb } from '@/lib/db/index';
import { Card, StatCard } from '@/components/ui';
import { FilterBar } from '@/components/app/FilterBar';
import { MessageCenter } from '@/components/app/MessageCenter';
import { MESSAGE_CHANNELS } from '@/lib/domain/constants';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'תקשורת — Recruiter OS' };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Central view of every message across candidates and clients — the "did I already
 * write to them?" screen, plus the drafts waiting to be sent.
 */
export default async function MessagesPage({ searchParams }: PageProps) {
  const auth = await requireAuth();
  const params = await searchParams;

  const messages = listMessages(auth.org.id, {
    channel: first(params.channel),
    status: first(params.status),
    limit: 200,
  });

  const counts = getDb().get<{ total: number; drafts: number; sent: number; received: number }>(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'draft') AS drafts,
            COUNT(*) FILTER (WHERE direction = 'out' AND status != 'draft') AS sent,
            COUNT(*) FILTER (WHERE direction = 'in') AS received
       FROM messages WHERE org_id = ?`,
    auth.org.id,
  );

  const channels = integrationStatus().filter((item) => item.name !== ('calendar' as never));
  const connected = channels.filter((channel) => channel.connected);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-ink">מרכז התקשורת</h1>
        <p className="text-sm text-muted">
          כל ההודעות למועמדים וללקוחות במקום אחד — כל הודעה מקושרת לרשומה שלה.
        </p>
      </header>

      {connected.length === 0 && (
        <p className="rounded-lg bg-warn/10 px-4 py-3 text-sm text-warn">
          לא מחובר ספק שליחה, ולכן הודעות נשמרות בהיסטוריה ולא נשלחות מהמערכת. אפשר לפתוח כל הודעה
          בוואטסאפ בלחיצה, או לחבר ספק דרך משתני הסביבה — שכבת השירות כבר מוכנה.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="סה״כ הודעות" value={counts?.total ?? 0} />
        <StatCard label="נשלחו" value={counts?.sent ?? 0} />
        <StatCard
          label="טיוטות ממתינות"
          value={counts?.drafts ?? 0}
          tone={(counts?.drafts ?? 0) > 0 ? 'warn' : undefined}
        />
        <StatCard label="התקבלו" value={counts?.received ?? 0} />
      </div>

      <FilterBar
        searchPlaceholder="הסינון כאן לפי ערוץ וסטטוס"
        filters={[
          { key: 'channel', label: 'ערוץ', options: MESSAGE_CHANNELS },
          {
            key: 'status',
            label: 'סטטוס',
            options: [
              { value: 'draft', label: 'טיוטה' },
              { value: 'sent', label: 'נשלח' },
              { value: 'read', label: 'נקרא' },
              { value: 'failed', label: 'נכשל' },
            ],
          },
        ]}
      />

      <Card bodyClassName="p-0">
        <MessageCenter messages={messages} />
      </Card>
    </div>
  );
}
