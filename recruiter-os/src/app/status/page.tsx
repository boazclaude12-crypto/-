import fs from 'node:fs';
import { getDb } from '@/lib/db/index';
import { storageHealth } from '@/lib/storage-health';
import { buildInfo, watchdogReport } from '@/lib/watchdog';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'מצב המערכת',
  robots: 'noindex',
  // Re-renders itself so a stall can be watched as it happens, without any script.
  other: { refresh: '15' },
};

/**
 * A page that stays up when nothing else does.
 *
 * When a page "just loads forever" there are three possible culprits and no way to tell
 * them apart from the browser: the host is not routing to the container, the container is
 * blocked, or the running build is not the one that was pushed. This page answers all
 * three. It deliberately depends on as little as possible — no session, no shared layout,
 * no stylesheet, no client script — so that reaching it at all is itself a finding: if it
 * renders and the app does not, the host and the container are fine and the fault is in
 * the app; if even this hangs, nothing in the app is the cause.
 *
 * It reports durations, sizes and versions — never anyone's data — so it needs no login,
 * which matters because signing in is often the thing that has broken.
 */
export default async function StatusPage() {
  const build = buildInfo();
  const watchdog = watchdogReport();
  const checks = await runChecks();

  const problems = checks.filter((check) => check.level !== 'ok');
  const worst = problems.some((check) => check.level === 'bad') ? 'bad' : problems.length ? 'warn' : 'ok';

  return (
    <main style={S.page}>
      <h1 style={S.h1}>מצב המערכת</h1>

      <div style={{ ...S.verdict, ...VERDICT_STYLE[worst] }}>
        {worst === 'ok'
          ? 'השרת עונה, והכול בטווח תקין.'
          : worst === 'warn'
            ? 'השרת עונה, אבל יש משהו שדורש תשומת לב.'
            : 'השרת עונה, אבל משהו שבור — הפירוט למטה.'}
      </div>

      <p style={S.lead}>
        אם הדף הזה נפתח, המכולה חיה ו-Railway מנתב אליה כמו שצריך. הדף מתרענן לבד כל 15 שניות.
      </p>

      <Section title="הגרסה שרצה עכשיו">
        <Row label="מזהה בנייה" value={build.buildId} />
        <Row label="קומיט" value={build.commit} />
        <Row label="ענף" value={build.branch} />
        <Row label="נבנה בתאריך" value={formatTime(build.builtAt)} />
        <p style={S.note}>
          אם הקומיט כאן הוא לא זה שנדחף — Railway לא בנה את השינוי האחרון, והבעיה היא בפריסה ולא בקוד.
        </p>
      </Section>

      <Section title="בדיקות">
        <table style={S.table}>
          <tbody>
            {checks.map((check) => (
              <tr key={check.name}>
                <td style={S.cell}>{ICON[check.level]}</td>
                <td style={{ ...S.cell, fontWeight: 600 }}>{check.name}</td>
                <td style={S.cell}>{check.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="זמן פעילות ותקיעות">
        <Row label="השרת עלה" value={`${formatTime(watchdog.bootedAt)} (לפני ${formatDuration(watchdog.uptimeSeconds)})`} />
        <Row label="עיכוב נוכחי" value={`${watchdog.lastLagMs}ms`} />
        <Row label="העיכוב הגדול ביותר מאז ההפעלה" value={`${watchdog.maxLagMs}ms`} />
        <Row
          label="תקיעות ברבע השעה האחרונה"
          value={
            watchdog.recentStalls.length === 0
              ? 'אין'
              : `${watchdog.recentStalls.length} — הארוכה ${Math.round(watchdog.worstRecentStallMs / 100) / 10} שניות`
          }
        />
        <p style={S.note}>
          תקיעה היא פרק זמן שבו השרת לא הצליח לענות לאף אחד. אם יש כאן תקיעות ארוכות, זה בדיוק מה שנראה
          בדפדפן כדף שנתקע בטעינה.
        </p>
      </Section>

      <Section title="קליטת מייל ברקע">
        <Row
          label="ריצה אחרונה"
          value={
            watchdog.lastSync
              ? `${formatTime(watchdog.lastSync.at)} — ${watchdog.lastSync.ok ? 'הצליחה' : 'נכשלה'}: ${watchdog.lastSync.detail}`
              : 'עדיין לא רצה מאז ההפעלה'
          }
        />
      </Section>

      <p style={S.footer}>
        נבדק ב-{formatTime(new Date().toISOString())}. הדף הזה לא מציג שום מידע על מועמדים, לקוחות או משרות.
      </p>
    </main>
  );
}

type Level = 'ok' | 'warn' | 'bad';
type Check = { name: string; level: Level; detail: string };

/**
 * Each check is isolated: a database that will not open must still leave the storage and
 * memory readings visible, because together they are usually what explains it.
 */
async function runChecks(): Promise<Check[]> {
  const checks: Check[] = [];

  checks.push(await timedCheck('פתיחת מסד הנתונים', 1000, () => { getDb(); }));
  checks.push(await timedCheck('קריאה מהמסד', 500, () => getDb().get('SELECT COUNT(*) AS n FROM users')));
  checks.push(
    await timedCheck('כתיבה למסד', 500, () => {
      const db = getDb();
      db.run(
        "INSERT INTO rate_limits (bucket, window_start, count) VALUES ('__status', ?, 1) " +
          'ON CONFLICT(bucket) DO UPDATE SET count = count + 1',
        Date.now(),
      );
      db.run("DELETE FROM rate_limits WHERE bucket = '__status'");
    }),
  );

  try {
    const storage = storageHealth();
    checks.push({
      name: 'אחסון קבוע (Volume)',
      // Outside a container there is no volume to miss, so that is not a finding.
      level: storage.persistent || !storage.containerised ? 'ok' : 'bad',
      detail: storage.persistent
        ? `מחובר ב-${storage.dataDir} — הנתונים שורדים פריסה`
        : storage.containerised
          ? `${storage.dataDir} אינו Volume — כל הנתונים יימחקו בפריסה הבאה`
          : `${storage.dataDir} (לא רץ במכולה)`,
    });

    if (storage.totalBytes && storage.freeBytes !== null) {
      const usedPercent = Math.round(((storage.totalBytes - storage.freeBytes) / storage.totalBytes) * 100);
      checks.push({
        name: 'מקום פנוי בדיסק',
        // A full volume stops every write, and SQLite waits rather than failing fast.
        level: usedPercent >= 95 ? 'bad' : usedPercent >= 85 ? 'warn' : 'ok',
        detail: `${usedPercent}% בשימוש — ${formatBytes(storage.freeBytes)} פנויים מתוך ${formatBytes(storage.totalBytes)}`,
      });
    }

    checks.push({
      name: 'קבצים שמורים',
      level: 'ok',
      detail: `${storage.uploadCount} קבצים (${formatBytes(storage.uploadBytes)}), מסד נתונים ${formatBytes(storage.databaseBytes)}`,
    });
  } catch (caught) {
    checks.push({ name: 'אחסון', level: 'bad', detail: message(caught) });
  }

  checks.push(memoryCheck());
  return checks;
}

async function timedCheck(name: string, budgetMs: number, run: () => unknown): Promise<Check> {
  const started = performance.now();
  try {
    await run();
  } catch (caught) {
    return { name, level: 'bad', detail: `נכשל: ${message(caught)}` };
  }
  const elapsed = Math.round(performance.now() - started);
  return {
    name,
    level: elapsed > budgetMs * 3 ? 'bad' : elapsed > budgetMs ? 'warn' : 'ok',
    detail: `${elapsed}ms`,
  };
}

/**
 * A container near its memory ceiling behaves exactly like a slow one: trivial responses
 * stay instant while anything that renders a page crawls, because the collector never
 * stops. Node cannot see the limit, so it is read from the kernel's cgroup.
 */
function memoryCheck(): Check {
  const rssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  let limitMb: number | null = null;
  for (const file of ['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes']) {
    try {
      const raw = fs.readFileSync(file, 'utf8').trim();
      const bytes = Number(raw);
      if (raw && raw !== 'max' && Number.isFinite(bytes) && bytes < 1024 ** 4) {
        limitMb = Math.round(bytes / 1024 / 1024);
      }
      break;
    } catch {
      /* not this cgroup layout */
    }
  }
  if (limitMb === null) return { name: 'זיכרון', level: 'ok', detail: `${rssMb}MB בשימוש (אין מגבלה ידועה)` };
  const percent = Math.round((rssMb / limitMb) * 100);
  return {
    name: 'זיכרון',
    level: percent >= 90 ? 'bad' : percent >= 80 ? 'warn' : 'ok',
    detail: `${rssMb}MB מתוך ${limitMb}MB (${percent}%)`,
  };
}

function message(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)}KB`;
  if (bytes < 1024 ** 3) return `${Math.round(bytes / 1024 ** 2)}MB`;
  return `${Math.round((bytes / 1024 ** 3) * 10) / 10}GB`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} שניות`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} דקות`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} שעות`;
  return `${Math.round(seconds / 86_400)} ימים`;
}

function formatTime(iso: string): string {
  if (!iso || iso === 'לא ידוע') return 'לא ידוע';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  // Israel time, because that is the clock the person reading this is looking at.
  return date.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'medium' });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={S.section}>
      <h2 style={S.h2}>{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={S.row}>
      <span style={S.rowLabel}>{label}</span>
      <span style={S.rowValue}>{value}</span>
    </div>
  );
}

const ICON: Record<Level, string> = { ok: '✅', warn: '⚠️', bad: '❌' };

const VERDICT_STYLE: Record<Level, React.CSSProperties> = {
  ok: { background: '#dcfce7', color: '#14532d' },
  warn: { background: '#fef9c3', color: '#713f12' },
  bad: { background: '#fee2e2', color: '#7f1d1d' },
};

// Inline styles on purpose: the stylesheet is one more thing that can fail to load, and
// this page has to stay readable when other things are failing.
const S: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: '0 auto',
    padding: 20,
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    lineHeight: 1.6,
    color: '#0f172a',
    background: '#fff',
  },
  h1: { fontSize: 26, margin: '0 0 16px' },
  h2: { fontSize: 17, margin: '0 0 10px', color: '#334155' },
  verdict: { padding: '12px 16px', borderRadius: 10, fontWeight: 600, fontSize: 17 },
  lead: { color: '#475569', fontSize: 15 },
  section: { marginTop: 26, borderTop: '1px solid #e2e8f0', paddingTop: 16 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 15 },
  cell: { padding: '7px 8px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', verticalAlign: 'top' },
  row: { display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', padding: '5px 0', fontSize: 15 },
  rowLabel: { color: '#64748b' },
  rowValue: { fontWeight: 600, wordBreak: 'break-word' },
  note: { marginTop: 10, fontSize: 14, color: '#64748b' },
  footer: { marginTop: 28, fontSize: 13, color: '#94a3b8' },
};
