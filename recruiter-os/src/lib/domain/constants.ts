/**
 * Domain vocabulary in one place. UI labels are Hebrew by default; every list is
 * exported as data (not hard-coded in components) so an English locale can be added
 * without touching business logic.
 */

export interface Option<T extends string = string> {
  value: T;
  label: string;
  color?: string;
}

/** Default pipeline the app seeds for a new organisation. Editable per org afterwards. */
export const DEFAULT_STAGES = [
  { key: 'new', label: 'חדש', color: 'slate', in_pipeline: 1, is_terminal: 0, outcome: 'neutral' },
  { key: 'contacted', label: 'נוצר קשר', color: 'sky', in_pipeline: 1, is_terminal: 0, outcome: 'neutral' },
  { key: 'interested', label: 'מעוניין', color: 'cyan', in_pipeline: 1, is_terminal: 0, outcome: 'neutral' },
  { key: 'screening', label: 'סינון', color: 'indigo', in_pipeline: 1, is_terminal: 0, outcome: 'neutral' },
  { key: 'interview', label: 'ראיון', color: 'violet', in_pipeline: 1, is_terminal: 0, outcome: 'neutral' },
  { key: 'sent_to_client', label: 'נשלח ללקוח', color: 'amber', in_pipeline: 1, is_terminal: 0, outcome: 'neutral' },
  { key: 'client_interview', label: 'ראיון אצל לקוח', color: 'orange', in_pipeline: 1, is_terminal: 0, outcome: 'neutral' },
  { key: 'hired', label: 'התקבל', color: 'emerald', in_pipeline: 1, is_terminal: 0, outcome: 'positive' },
  { key: 'started', label: 'התחיל עבודה', color: 'green', in_pipeline: 1, is_terminal: 1, outcome: 'positive' },
  { key: 'rejected', label: 'נדחה', color: 'rose', in_pipeline: 0, is_terminal: 1, outcome: 'negative' },
  { key: 'not_interested', label: 'לא מעוניין', color: 'stone', in_pipeline: 0, is_terminal: 1, outcome: 'negative' },
  { key: 'irrelevant', label: 'לא רלוונטי', color: 'zinc', in_pipeline: 0, is_terminal: 1, outcome: 'negative' },
] as const;

export type StageKey = (typeof DEFAULT_STAGES)[number]['key'];

/** Order used when a stage change should also move the candidate forward. */
export const PIPELINE_ORDER: string[] = DEFAULT_STAGES.filter((s) => s.in_pipeline === 1).map((s) => s.key);

export const JOB_STATUSES: Option[] = [
  { value: 'open', label: 'פתוחה', color: 'emerald' },
  { value: 'sourcing', label: 'בגיוס', color: 'sky' },
  { value: 'on_hold', label: 'בהמתנה', color: 'amber' },
  { value: 'frozen', label: 'הוקפאה', color: 'slate' },
  { value: 'closed', label: 'נסגרה', color: 'zinc' },
];

export const ACTIVE_JOB_STATUSES = ['open', 'sourcing'];

export const JOB_PRIORITIES: Option[] = [
  { value: 'low', label: 'נמוכה', color: 'slate' },
  { value: 'normal', label: 'רגילה', color: 'sky' },
  { value: 'high', label: 'גבוהה', color: 'amber' },
  { value: 'urgent', label: 'דחופה', color: 'rose' },
];

export const AVAILABILITY: Option[] = [
  { value: 'immediate', label: 'מיידית' },
  { value: 'two_weeks', label: 'שבועיים' },
  { value: 'month', label: 'חודש' },
  { value: 'later', label: 'בהמשך' },
  { value: 'unavailable', label: 'לא זמין' },
];

export const EMPLOYMENT_TYPES: Option[] = [
  { value: 'full_time', label: 'משרה מלאה' },
  { value: 'part_time', label: 'משרה חלקית' },
  { value: 'shifts', label: 'משמרות' },
  { value: 'freelance', label: 'פרילנס' },
  { value: 'temp', label: 'זמני' },
];

export const WORK_MODES: Option[] = [
  { value: 'onsite', label: 'במקום העבודה' },
  { value: 'hybrid', label: 'היברידי' },
  { value: 'remote', label: 'מרחוק' },
];

export const CANDIDATE_SOURCES: Option[] = [
  { value: 'facebook', label: 'פייסבוק' },
  { value: 'whatsapp_group', label: 'קבוצת ווטסאפ' },
  { value: 'referral', label: 'המלצה' },
  { value: 'job_board', label: 'לוח דרושים' },
  { value: 'website', label: 'אתר' },
  { value: 'walk_in', label: 'פנייה ישירה' },
  { value: 'database', label: 'מאגר קיים' },
  { value: 'other', label: 'אחר' },
];

export const TASK_PRIORITIES: Option[] = [
  { value: 'low', label: 'נמוכה', color: 'slate' },
  { value: 'normal', label: 'רגילה', color: 'sky' },
  { value: 'high', label: 'גבוהה', color: 'amber' },
  { value: 'urgent', label: 'דחופה', color: 'rose' },
];

export const INTERVIEW_KINDS: Option[] = [
  { value: 'phone', label: 'שיחת טלפון' },
  { value: 'recruiter', label: 'ראיון אצלי' },
  { value: 'client', label: 'ראיון אצל לקוח' },
  { value: 'technical', label: 'מבחן מקצועי' },
];

export const MESSAGE_CHANNELS: Option[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'אימייל' },
  { value: 'call', label: 'שיחה' },
  { value: 'note', label: 'תיעוד' },
];

export const PAYMENT_STATUSES: Option[] = [
  { value: 'expected', label: 'צפוי', color: 'sky' },
  { value: 'invoiced', label: 'הופקה חשבונית', color: 'indigo' },
  { value: 'paid', label: 'שולם', color: 'emerald' },
  { value: 'overdue', label: 'באיחור', color: 'rose' },
  { value: 'written_off', label: 'נמחק', color: 'zinc' },
];

export const PLACEMENT_STATUSES: Option[] = [
  { value: 'active', label: 'פעילה', color: 'emerald' },
  { value: 'guarantee', label: 'בתקופת אחריות', color: 'amber' },
  { value: 'completed', label: 'הושלמה', color: 'sky' },
  { value: 'fallen_through', label: 'התבטלה', color: 'rose' },
];

export const CLIENT_STATUSES: Option[] = [
  { value: 'lead', label: 'ליד', color: 'sky' },
  { value: 'active', label: 'פעיל', color: 'emerald' },
  { value: 'paused', label: 'מושהה', color: 'amber' },
  { value: 'archived', label: 'ארכיון', color: 'zinc' },
];

export const REQUIREMENT_KINDS: Option[] = [
  { value: 'license', label: 'רישיון' },
  { value: 'certification', label: 'הסמכה' },
  { value: 'skill', label: 'כישור' },
  { value: 'experience', label: 'ניסיון' },
  { value: 'education', label: 'השכלה' },
  { value: 'language', label: 'שפה' },
  { value: 'other', label: 'אחר' },
];

export const ATTRIBUTE_KINDS: Option[] = [
  { value: 'license', label: 'רישיון' },
  { value: 'certification', label: 'הסמכה' },
  { value: 'skill', label: 'כישור' },
  { value: 'language', label: 'שפה' },
];

export const REGIONS: Option[] = [
  { value: 'north', label: 'צפון' },
  { value: 'haifa', label: 'חיפה והקריות' },
  { value: 'sharon', label: 'שרון' },
  { value: 'center', label: 'מרכז' },
  { value: 'jerusalem', label: 'ירושלים' },
  { value: 'shfela', label: 'שפלה' },
  { value: 'south', label: 'דרום' },
];

export function labelOf(options: Option[], value: string | null | undefined, fallback = '—'): string {
  if (!value) return fallback;
  return options.find((o) => o.value === value)?.label ?? value;
}

export function colorOf(options: Option[], value: string | null | undefined, fallback = 'slate'): string {
  if (!value) return fallback;
  return options.find((o) => o.value === value)?.color ?? fallback;
}
