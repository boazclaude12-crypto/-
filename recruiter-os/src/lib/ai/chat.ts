import { getDb } from '../db/index';
import { repos } from '../db/repos';
import { normalize } from '../text';
import { lookupPlace } from '../geo';
import { getAiProvider } from './index';
import { nextBestActions } from '../domain/next-best-action';
import { clientsAwaitingFeedback } from '../domain/clients';
import { listJobs } from '../domain/jobs';
import { findCandidatesByCriteria } from '../domain/search';
import { matchCandidatesForJob } from '../matching/service';
import { revenueThisMonth } from '../domain/payments';
import { listTasks } from '../domain/tasks';
import { AVAILABILITY, labelOf } from '../domain/constants';

export interface ChatReply {
  answer: string;
  provider: string;
  /** Records that back the answer, rendered as links under it. */
  references: Array<{ kind: 'candidate' | 'job' | 'client'; id: string; label: string }>;
  intent: string;
}

type Intent =
  | 'match_for_job'
  | 'callbacks'
  | 'stale_jobs'
  | 'clients_waiting'
  | 'revenue'
  | 'find_candidates'
  | 'next_action'
  | 'counts'
  | 'tasks'
  | 'unknown';

const money = (value: number) => `₪${Math.round(value).toLocaleString('he-IL')}`;

function detectIntent(question: string): Intent {
  const q = normalize(question);
  if (/(מה כדאי|מה לעשות|במה להתמקד|מה חשוב עכשיו|next)/.test(q)) return 'next_action';
  if (/(מי מתאים|מועמדים מתאימים|התאמה למשרה|מי הכי מתאים)/.test(q)) return 'match_for_job';
  if (/(לחזור אליו|לחזור אליהם|מי מחכה לי|לא ענו|לא חזרו|follow ?up|מעקב)/.test(q)) return 'callbacks';
  if (/(משרות פתוחות|פתוחה כבר|תקועות|ישנות|כמה זמן פתוח)/.test(q)) return 'stale_jobs';
  if (/(לקוחות ממתינים|פידבק|ממתין לתשובה|מחכה לפידבק)/.test(q)) return 'clients_waiting';
  if (/(כסף|הכנסה|עמלה|לגבות|תשלום|רווח|כמה אכניס)/.test(q)) return 'revenue';
  if (/(משימות|מה יש לי היום|לוח זמנים)/.test(q)) return 'tasks';
  if (/(כמה מועמדים|כמה משרות|כמה לקוחות|כמה השמות)/.test(q)) return 'counts';
  if (/(הראה לי|מצא|חפש|מי עם|מועמדים עם|רישיון|באזור|מ?העיר)/.test(q)) return 'find_candidates';
  return 'unknown';
}

function findJobInQuestion(orgId: string, question: string) {
  const jobs = listJobs(orgId, { limit: 200 });
  const q = normalize(question);
  let best: { job: (typeof jobs)[number]; score: number } | null = null;
  for (const job of jobs) {
    const title = normalize(job.title);
    if (!title) continue;
    const words = title.split(' ').filter((word) => word.length > 2);
    const hits = words.filter((word) => q.includes(word)).length;
    if (hits === 0) continue;
    const score = hits / words.length + (job.city && q.includes(normalize(job.city)) ? 0.5 : 0);
    if (!best || score > best.score) best = { job, score };
  }
  return best && best.score >= 0.5 ? best.job : null;
}

function extractCriteria(question: string) {
  const q = normalize(question);
  const licenseMatch = question.match(/רישיון\s*([A-Za-z]{1,2}\d?)/i) ?? q.match(/\b(ce|c1|c|d|b)\b/i);
  const city = question
    .split(/[\s,.?!]+/)
    .map((token) => lookupPlace(token))
    .find((place) => place !== null);

  const roleMatch = question.match(/(נהג\s*\S*|מלגזן|מחסנאי|מנופאי|מלקט|טכנאי|מוקדן|מכירות)/);
  const availability = /מיידית|מיידי|זמין עכשיו/.test(q) ? 'immediate' : undefined;

  return {
    license: licenseMatch?.[1] ?? undefined,
    city: city?.city,
    role: roleMatch?.[1]?.trim(),
    availability,
  };
}

/**
 * Answers a question against the user's own database.
 *
 * Retrieval happens here — deterministically, and always scoped to the caller's org.
 * The AI provider only phrases the facts it is handed; it never queries anything itself,
 * which is what keeps answers grounded and keeps candidate data inside the account.
 */
export async function askRecruiterChat(
  orgId: string,
  userName: string,
  question: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
): Promise<ChatReply> {
  const intent = detectIntent(question);
  const references: ChatReply['references'] = [];
  let context = '';

  switch (intent) {
    case 'next_action': {
      const actions = nextBestActions(orgId, 5);
      context = actions.length
        ? `הפעולות הכי דחופות כרגע:\n${actions.map((a, i) => `${i + 1}. ${a.title} — ${a.detail}`).join('\n')}`
        : 'אין כרגע פעולות דחופות. זה זמן טוב להוסיף מועמדים חדשים למאגר או לחדש קשר עם לקוחות.';
      break;
    }

    case 'match_for_job': {
      const job = findJobInQuestion(orgId, question);
      if (!job) {
        const open = listJobs(orgId, { activeOnly: true, limit: 8 });
        context = open.length
          ? `לא זיהיתי לאיזו משרה הכוונה. המשרות הפתוחות שלך:\n${open.map((j) => `• ${j.title}${j.city ? ` — ${j.city}` : ''}`).join('\n')}`
          : 'אין כרגע משרות פתוחות במערכת.';
        break;
      }
      const matches = matchCandidatesForJob(orgId, job.id, { limit: 5, minScore: 40 });
      references.push({ kind: 'job', id: job.id, label: job.title });
      if (matches.length === 0) {
        context = `למשרת ${job.title} לא נמצאו מועמדים מתאימים במאגר (מעל 40% התאמה). כדאי להרחיב את החיפוש או להוסיף מועמדים.`;
        break;
      }
      context = `המועמדים המתאימים ביותר למשרת ${job.title}${job.city ? ` ב${job.city}` : ''}:\n${matches
        .map((match, index) => {
          references.push({ kind: 'candidate', id: match.candidate.id, label: match.candidate.name });
          const reason = match.reasons.slice(0, 2).join('; ') || 'התאמה כללית';
          const gap = match.gaps.length ? ` | חסר: ${match.gaps[0]}` : '';
          return `${index + 1}. ${match.candidate.name} — ${match.score}% (${reason})${gap}`;
        })
        .join('\n')}`;
      break;
    }

    case 'callbacks': {
      const db = getDb();
      const rows = db.all<{ id: string; name: string; days: number }>(
        `SELECT c.id, (c.first_name || ' ' || c.last_name) AS name,
                CAST(julianday('now') - julianday(COALESCE(c.last_contact_at, c.created_at)) AS INTEGER) AS days
           FROM candidates c
          WHERE c.org_id = ? AND c.status_key IN ('new','contacted','interested','screening')
            AND julianday('now') - julianday(COALESCE(c.last_contact_at, c.created_at)) >= 2
          ORDER BY days DESC LIMIT 10`,
        orgId,
      );
      for (const row of rows) references.push({ kind: 'candidate', id: row.id, label: row.name });
      context = rows.length
        ? `מועמדים שממתינים לחזרה ממך:\n${rows.map((r) => `• ${r.name} — ${r.days} ימים ללא מגע`).join('\n')}`
        : 'אין מועמדים שממתינים לחזרה. הכול מעודכן.';
      break;
    }

    case 'stale_jobs': {
      const jobs = listJobs(orgId, { activeOnly: true, limit: 100 })
        .filter((job) => job.days_open >= 14)
        .slice(0, 10);
      for (const job of jobs) references.push({ kind: 'job', id: job.id, label: job.title });
      context = jobs.length
        ? `משרות שפתוחות יותר משבועיים:\n${jobs.map((j) => `• ${j.title}${j.client_name ? ` (${j.client_name})` : ''} — ${j.days_open} ימים, ${j.active_candidates} מועמדים בתהליך`).join('\n')}`
        : 'אין משרות שפתוחות מעל שבועיים.';
      break;
    }

    case 'clients_waiting': {
      const waiting = clientsAwaitingFeedback(orgId, 12);
      for (const row of waiting) references.push({ kind: 'client', id: row.client_id, label: row.client_name });
      context = waiting.length
        ? `לקוחות שממתינים לפידבק:\n${waiting.map((w) => `• ${w.client_name} — ${w.candidate_name} למשרת ${w.job_title}, ממתין ${w.hours_waiting} שעות`).join('\n')}`
        : 'אין לקוחות שממתינים לפידבק כרגע.';
      break;
    }

    case 'revenue': {
      const revenue = revenueThisMonth(orgId);
      const collectible = getDb().get<{ total: number }>(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM payments
          WHERE org_id = ? AND status IN ('expected','invoiced','overdue')`,
        orgId,
      );
      context = [
        `תמונת הכסף לחודש הנוכחי:`,
        `• הכנסה צפויה: ${money(revenue.expected)}`,
        `• התקבל בפועל: ${money(revenue.received)}`,
        `• ממתין לגבייה: ${money(revenue.pending)}`,
        revenue.overdue > 0 ? `• באיחור: ${money(revenue.overdue)}` : '',
        `• השמות החודש: ${revenue.placements}`,
        `• סך הכול פתוח לגבייה (כל התקופות): ${money(collectible?.total ?? 0)}`,
      ].filter(Boolean).join('\n');
      break;
    }

    case 'tasks': {
      const tasks = listTasks(orgId, { status: 'open', scope: 'today', limit: 10 });
      context = tasks.length
        ? `המשימות שלך להיום:\n${tasks.map((t) => `• ${t.title}${t.candidate_name ? ` (${t.candidate_name})` : ''}${t.is_overdue ? ' — באיחור' : ''}`).join('\n')}`
        : 'אין משימות פתוחות להיום.';
      break;
    }

    case 'counts': {
      const db = getDb();
      const counts = db.get<{ candidates: number; jobs: number; open_jobs: number; clients: number; placements: number }>(
        `SELECT
           (SELECT COUNT(*) FROM candidates WHERE org_id = ?) AS candidates,
           (SELECT COUNT(*) FROM jobs WHERE org_id = ?) AS jobs,
           (SELECT COUNT(*) FROM jobs WHERE org_id = ? AND status IN ('open','sourcing')) AS open_jobs,
           (SELECT COUNT(*) FROM clients WHERE org_id = ?) AS clients,
           (SELECT COUNT(*) FROM placements WHERE org_id = ? AND status != 'fallen_through') AS placements`,
        orgId, orgId, orgId, orgId, orgId,
      )!;
      context = `במערכת שלך: ${counts.candidates} מועמדים, ${counts.jobs} משרות (${counts.open_jobs} פתוחות), ${counts.clients} לקוחות ו-${counts.placements} השמות.`;
      break;
    }

    case 'find_candidates': {
      const criteria = extractCriteria(question);
      const results = findCandidatesByCriteria(orgId, { ...criteria, limit: 12 });
      for (const row of results) references.push({ kind: 'candidate', id: row.id, label: row.name });
      const described = [
        criteria.license ? `רישיון ${criteria.license.toUpperCase()}` : '',
        criteria.role ?? '',
        criteria.city ? `באזור ${criteria.city}` : '',
        criteria.availability ? 'זמינים מיידית' : '',
      ].filter(Boolean).join(', ');
      context = results.length
        ? `נמצאו ${results.length} מועמדים${described ? ` (${described})` : ''}:\n${results
            .map((r) => `• ${r.name}${r.current_role ? ` — ${r.current_role}` : ''}${r.city ? `, ${r.city}` : ''} · זמינות: ${labelOf(AVAILABILITY, r.availability, 'לא ידוע')}`)
            .join('\n')}`
        : `לא נמצאו מועמדים${described ? ` עם: ${described}` : ''}. אפשר לנסות חיפוש רחב יותר.`;
      break;
    }

    default: {
      const counts = {
        candidates: repos.candidates.count(orgId),
        openJobs: listJobs(orgId, { activeOnly: true, limit: 200 }).length,
      };
      const actions = nextBestActions(orgId, 3);
      context = [
        `${userName}, לא זיהיתי בדיוק מה נדרש. הנה תמונת מצב: ${counts.candidates} מועמדים במאגר, ${counts.openJobs} משרות פתוחות.`,
        actions.length ? `הכי דחוף כרגע:\n${actions.map((a) => `• ${a.title}`).join('\n')}` : '',
        'אפשר לשאול למשל: "מי מתאים למשרת נהג בחיפה?", "מי צריך שאחזור אליו?", "כמה כסף אני צפוי להכניס החודש?"',
      ].filter(Boolean).join('\n\n');
      break;
    }
  }

  const provider = getAiProvider();
  const result = await provider.answer({ question, history, context });

  // Deduplicate references while keeping the order they were found in.
  const seen = new Set<string>();
  const uniqueReferences = references.filter((reference) => {
    const key = `${reference.kind}:${reference.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    answer: result.answer,
    provider: result.provider,
    references: uniqueReferences.slice(0, 8),
    intent,
  };
}

export const CHAT_SUGGESTIONS = [
  'מה כדאי לי לעשות עכשיו?',
  'מי צריך שאני אחזור אליו?',
  'אילו משרות פתוחות כבר יותר משבועיים?',
  'איזה לקוחות ממתינים לפידבק?',
  'כמה כסף אני צפוי להכניס החודש?',
  'הראה לי מועמדים עם רישיון C באזור חיפה',
];
