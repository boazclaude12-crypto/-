import { requireAuth } from '@/lib/auth/server';
import { stagesFor } from '@/lib/domain/applications';
import { tagsWithCounts } from '@/lib/domain/tags';
import { orgStats } from '@/lib/auth/service';
import { aiStatus } from '@/lib/ai/index';
import { integrationStatus } from '@/lib/integrations/index';
import { Badge, Card } from '@/components/ui';
import { Icon } from '@/components/ui/icons';
import { StageEditor, DemoDataCard } from '@/components/app/SettingsPanels';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'הגדרות — Recruiter OS' };

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'אימייל',
  calendar: 'יומן',
};

export default async function SettingsPage() {
  const auth = await requireAuth();
  const stats = orgStats(auth.org.id);
  const stages = stagesFor(auth.org.id);
  const tags = tagsWithCounts(auth.org.id);
  const ai = aiStatus();
  const integrations = integrationStatus();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-ink">הגדרות</h1>
        <p className="text-sm text-muted">התאמת המערכת לאופן שבו אתה עובד.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="החשבון שלי">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-faint">שם</dt>
              <dd className="text-ink">{auth.user.name}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-faint">אימייל</dt>
              <dd className="text-ink" dir="ltr">{auth.user.email}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-faint">העסק</dt>
              <dd className="text-ink">{auth.org.name}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-faint">מטבע</dt>
              <dd className="text-ink">{auth.org.currency}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-faint">במאגר</dt>
              <dd className="num text-ink">
                {stats.candidates} מועמדים · {stats.jobs} משרות · {stats.clients} לקוחות
              </dd>
            </div>
          </dl>
        </Card>

        <Card title="מנוע ה-AI">
          <div className="flex items-center gap-2">
            <Badge tone={ai.provider === 'anthropic' ? 'brand' : 'slate'}>
              {ai.provider === 'anthropic' ? `Claude · ${ai.model}` : 'מנוע מקומי'}
            </Badge>
            {ai.configured && ai.provider === 'anthropic' && <Badge tone="emerald">מחובר</Badge>}
          </div>
          <p className="mt-2 text-sm text-muted">
            {ai.provider === 'anthropic'
              ? 'קריאת קורות חיים, ניסוח הודעות ותשובות העוזר עוברות דרך Claude. ההתאמה בין מועמדים למשרות תמיד מחושבת מקומית ובאופן דטרמיניסטי.'
              : 'הכול רץ מקומית: קריאת קורות חיים מבוססת חוקים, ההודעות נבנות מתבניות, והעוזר עונה ישירות מהנתונים שלך. אף מידע על מועמדים לא יוצא החוצה.'}
          </p>
          <p className="mt-2 text-xs text-faint">
            להפעלת Claude: הגדר <code className="rounded bg-bg px-1">AI_PROVIDER=anthropic</code> ו-
            <code className="rounded bg-bg px-1">ANTHROPIC_API_KEY</code> בקובץ הסביבה, והפעל מחדש.
          </p>
        </Card>

        <Card title="ערוצי תקשורת">
          <ul className="space-y-2">
            {integrations.map((integration) => (
              <li key={integration.name} className="flex items-center justify-between gap-3">
                <span className="text-sm text-ink">{CHANNEL_LABELS[integration.name] ?? integration.name}</span>
                <Badge tone={integration.connected ? 'emerald' : 'slate'}>
                  {integration.connected ? `מחובר (${integration.provider})` : 'לא מחובר'}
                </Badge>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted">
            אין ספק שליחה מחובר, ולכן המערכת לא מתיימרת לשלוח. הודעות נשמרות בהיסטוריה של המועמד, ואפשר לפתוח אותן
            בוואטסאפ בלחיצה. שכבת השירות מוכנה — חיבור ספק אמיתי דורש מפתחות בלבד.
          </p>
        </Card>

        <DemoDataCard hasData={stats.candidates > 0 || stats.jobs > 0} />
      </div>

      <Card
        title="שלבי הפייפליין"
        action={<span className="text-xs text-faint">{stages.length} שלבים</span>}
      >
        <p className="mb-3 text-sm text-muted">
          אלה גם הסטטוסים של המועמדים וגם עמודות הקנבן. אפשר לשנות שמות ולהוסיף שלבים משלך.
        </p>
        <StageEditor
          stages={stages.map((stage) => ({
            id: stage.id,
            key: stage.key,
            label: stage.label,
            color: stage.color,
            in_pipeline: stage.in_pipeline === 1,
            is_system: stage.is_system === 1,
          }))}
        />
      </Card>

      <Card title="תגיות" action={<span className="text-xs text-faint">{tags.length} תגיות</span>}>
        {tags.length === 0 ? (
          <p className="text-sm text-muted">
            עדיין אין תגיות. תגיות נוצרות אוטומטית כשמוסיפים אותן למועמד או למשרה.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Badge key={tag.id} tone={tag.color}>
                <Icon.Star size={11} />#{tag.name}
                <span className="num opacity-60"> {tag.candidate_count + tag.job_count}</span>
              </Badge>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
