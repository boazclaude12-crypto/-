import { EVENT_TYPES } from '../domain/events';

export interface AutomationDefinition {
  key: string;
  name: string;
  description: string;
  trigger_event: string;
  conditions?: Record<string, unknown>;
  action_type: 'create_task' | 'draft_message' | 'create_reminder';
  action_config: Record<string, unknown>;
  delay_minutes: number;
  is_enabled: boolean;
}

const HOUR = 60;
const DAY = 24 * HOUR;

/** The out-of-the-box rule set. Each one can be toggled or edited per organisation. */
export const DEFAULT_AUTOMATIONS: AutomationDefinition[] = [
  {
    key: 'welcome_new_candidate',
    name: 'הודעת פתיחה למועמד חדש',
    description: 'כשמועמד נוסף למאגר — מכינה טיוטת הודעת ווטסאפ לשליחה.',
    trigger_event: EVENT_TYPES.candidateCreated,
    action_type: 'draft_message',
    action_config: {
      channel: 'whatsapp',
      body: 'היי {{candidate}}, כאן מהגיוס. קיבלתי את הפרטים שלך ואני עובר עליהם — אחזור אליך בקרוב עם משרות שמתאימות לך. אם נוח לך שאתקשר בשעה מסוימת, כתוב לי.',
    },
    delay_minutes: 0,
    is_enabled: true,
  },
  {
    key: 'followup_no_answer',
    name: 'מעקב אחרי מועמד שלא ענה',
    description: 'אם המועמד לא חזר תוך 24 שעות מהודעה שנשלחה — נוצרת משימת מעקב.',
    trigger_event: EVENT_TYPES.messageSent,
    conditions: { audience: 'candidate' },
    action_type: 'create_task',
    action_config: {
      title: 'לחזור ל{{candidate}} — לא ענה להודעה',
      details: 'נשלחה הודעה לפני 24 שעות ולא התקבל מענה.',
      priority: 'high',
      dueInMinutes: 0,
    },
    delay_minutes: DAY,
    is_enabled: true,
  },
  {
    key: 'client_feedback_task',
    name: 'קבלת פידבק מהלקוח',
    description: 'כשמועמד נשלח ללקוח — נפתחת משימה לגבות פידבק אחרי יומיים.',
    trigger_event: EVENT_TYPES.applicationSentToClient,
    action_type: 'create_task',
    action_config: {
      title: 'לקבל פידבק מ{{client}} על {{candidate}}',
      details: 'המועמד נשלח ללקוח עבור המשרה {{job}}.',
      priority: 'high',
      dueInMinutes: 0,
    },
    delay_minutes: 2 * DAY,
    is_enabled: true,
  },
  {
    key: 'interview_reminder',
    name: 'תזכורת לפני ראיון',
    description: 'כשנקבע ראיון — נוצרת תזכורת לוודא שהמועמד מגיע.',
    trigger_event: EVENT_TYPES.interviewScheduled,
    action_type: 'create_reminder',
    action_config: {
      title: 'לוודא הגעה של {{candidate}} לראיון',
      priority: 'normal',
      dueInMinutes: 0,
    },
    delay_minutes: 60,
    is_enabled: true,
  },
  {
    key: 'hired_start_check',
    name: 'בדיקה שהמועמד התחיל לעבוד',
    description: 'כשמועמד מתקבל — נוצרת תזכורת לוודא שהוא באמת התחיל.',
    trigger_event: EVENT_TYPES.placementCreated,
    action_type: 'create_reminder',
    action_config: {
      title: 'לוודא ש{{candidate}} התחיל לעבוד אצל {{client}}',
      priority: 'high',
      dueInMinutes: 0,
    },
    delay_minutes: DAY,
    is_enabled: true,
  },
  {
    key: 'week_after_start',
    name: 'מעקב שבוע אחרי תחילת עבודה',
    description: 'שבוע אחרי שהמועמד התחיל — משימת מעקב מול המועמד והלקוח.',
    trigger_event: EVENT_TYPES.candidateStartedWork,
    action_type: 'create_task',
    action_config: {
      title: 'מעקב שבוע: {{candidate}} אצל {{client}}',
      details: 'לוודא שהכול תקין מול המועמד ומול הלקוח — זה מה ששומר על העמלה.',
      priority: 'normal',
      dueInMinutes: 0,
    },
    delay_minutes: 7 * DAY,
    is_enabled: true,
  },
  {
    key: 'rejected_keep_warm',
    name: 'שמירה על קשר עם מועמד שנדחה',
    description: 'כשמועמד נדחה — טיוטת הודעה מכבדת ששומרת אותו במאגר.',
    trigger_event: EVENT_TYPES.applicationRejected,
    action_type: 'draft_message',
    action_config: {
      channel: 'whatsapp',
      body: 'היי {{candidate}}, תודה על הזמן שהקדשת לתהליך עבור {{job}}. הפעם בחרו במועמד אחר, אבל הפרטים שלך אצלי ואני אעדכן אותך כשתיפתח משרה שמתאימה לך.',
    },
    delay_minutes: 0,
    is_enabled: false,
  },
];
