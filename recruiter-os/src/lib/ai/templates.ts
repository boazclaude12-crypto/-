import type { GeneratedMessage, MessageRequest } from './types';

function salaryLine(job: NonNullable<MessageRequest['job']>): string | null {
  if (!job.salary_min && !job.salary_max) return null;
  const unit = job.salary_period === 'hour' ? 'לשעה' : job.salary_period === 'year' ? 'לשנה' : 'לחודש';
  const format = (value: number) => `₪${value.toLocaleString('he-IL')}`;
  if (job.salary_min && job.salary_max && job.salary_min !== job.salary_max) {
    return `שכר ${format(job.salary_min)}–${format(job.salary_max)} ${unit}`;
  }
  return `שכר ${format(job.salary_max ?? job.salary_min!)} ${unit}`;
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

/**
 * Hebrew message templates per tone.
 *
 * They read like something a working recruiter would actually send: specific about the
 * job, short enough for WhatsApp, and ending with one clear question.
 */
export function renderMessage(request: MessageRequest): GeneratedMessage {
  const name = firstName(request.candidate.name);
  const job = request.job;
  const location = job?.city ? ` ב${job.city}` : '';
  const salary = job ? salaryLine(job) : null;
  const experience = request.candidate.current_role
    ? `ראיתי שיש לך ניסיון כ${request.candidate.current_role}`
    : request.candidate.years_experience
      ? `ראיתי שיש לך ${request.candidate.years_experience} שנות ניסיון`
      : 'ראיתי את הפרטים שלך';

  const lines: string[] = [];
  let subject: string | null = null;

  switch (request.tone) {
    case 'short':
      lines.push(`היי ${name},`);
      lines.push(
        job
          ? `יש לי משרת ${job.title}${location}${salary ? `, ${salary}` : ''}. מעניין אותך?`
          : 'יש לי משרה שיכולה להתאים לך. מעניין אותך שאשלח פרטים?',
      );
      break;

    case 'friendly':
      lines.push(`היי ${name}, מה שלומך?`);
      lines.push(
        job
          ? `${experience}, ויש לי משרת ${job.title}${location} שנראית לי ממש מתאימה לך.`
          : `${experience}, ואני חושב שיש לי כמה דברים שיכולים להתאים לך.`,
      );
      if (salary) lines.push(`${salary}.`);
      if (job?.highlights?.length) lines.push(`מה שיפה במשרה: ${job.highlights.slice(0, 3).join(', ')}.`);
      lines.push('נוח לך שאתקשר לדבר על זה? מתי הכי טוב לך?');
      break;

    case 'urgent':
      lines.push(`היי ${name},`);
      lines.push(
        job
          ? `המשרה ${job.title}${location} נסגרת בימים הקרובים והלקוח מראיין השבוע.`
          : 'יש לי משרה דחופה שנסגרת השבוע.',
      );
      if (salary) lines.push(`${salary}.`);
      lines.push('אם זה רלוונטי — תענה לי היום ואני מקדם אותך מיד.');
      break;

    case 'followup':
      lines.push(`היי ${name},`);
      lines.push(
        job
          ? `רק מוודא שראית את ההודעה שלי לגבי משרת ${job.title}${location}.`
          : 'רק מוודא שראית את ההודעה הקודמת שלי.',
      );
      lines.push('אם זה לא רלוונטי כרגע — תגיד לי ואעדכן, ואם כן — נדבר דקה ונתקדם.');
      break;

    case 'professional':
    default:
      subject = job ? `הצעת עבודה: ${job.title}${job.city ? ` — ${job.city}` : ''}` : 'הצעת עבודה';
      lines.push(`שלום ${name},`);
      lines.push(
        job
          ? `${experience}, ואני מגייס כרגע ${job.title}${location}${job.client_name ? ` עבור ${job.client_name}` : ''}.`
          : `${experience} ואשמח לבחון יחד משרות מתאימות.`,
      );
      if (salary) lines.push(`תנאי המשרה: ${salary}${job?.employment_type ? `, ${job.employment_type}` : ''}.`);
      if (job?.highlights?.length) lines.push(`דגשים: ${job.highlights.slice(0, 3).join(' · ')}.`);
      lines.push('אם זה מעניין אותך, אשמח לתאם שיחה קצרה. מתי נוח לך?');
      break;
  }

  if (request.context) lines.push(request.context);
  lines.push('', request.recruiter.name);

  return {
    subject: request.channel === 'email' ? subject ?? 'בנוגע למשרה' : null,
    body: lines.join('\n').trim(),
    provider: 'local',
  };
}
