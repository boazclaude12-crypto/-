import { z } from 'zod';

/** Shared validation. API routes and client forms use the same definitions. */

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z.union([z.string(), z.null()]).optional().transform((v) => {
    if (v === null || v === undefined) return null;
    const value = v.trim();
    return value.length ? value.slice(0, max) : null;
  });
const optionalNumber = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  });

export const emailSchema = z.string().trim().toLowerCase().email('כתובת מייל לא תקינה').max(200);
export const passwordSchema = z.string().min(8, 'סיסמה חייבת להכיל לפחות 8 תווים').max(200);

export const registerSchema = z.object({
  name: trimmed(80).min(2, 'יש להזין שם'),
  email: emailSchema,
  password: passwordSchema,
  orgName: optionalText(80),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'יש להזין סיסמה').max(200),
});

export const attributeSchema = z.object({
  kind: z.enum(['license', 'certification', 'skill', 'language']),
  value: trimmed(80).min(1),
});

export const experienceSchema = z.object({
  company: trimmed(120).min(1, 'יש להזין שם חברה'),
  title: trimmed(120).min(1, 'יש להזין תפקיד'),
  start_date: optionalText(20),
  end_date: optionalText(20),
  is_current: z.boolean().optional().default(false),
  description: optionalText(2000),
});

export const candidateSchema = z.object({
  first_name: trimmed(60).min(1, 'יש להזין שם פרטי'),
  last_name: optionalText(60),
  phone: optionalText(30),
  whatsapp: optionalText(30),
  email: z.union([z.string(), z.null()]).optional().transform((v) => {
    const value = typeof v === 'string' ? v.trim().toLowerCase() : '';
    return value.length ? value : null;
  }),
  region: optionalText(40),
  city: optionalText(60),
  current_role: optionalText(120),
  years_experience: optionalNumber,
  education: optionalText(200),
  current_salary: optionalNumber,
  desired_salary: optionalNumber,
  availability: optionalText(30),
  available_from: optionalText(30),
  employment_type: optionalText(30),
  source: optionalText(40),
  status_key: optionalText(40),
  rating: optionalNumber,
  notes: optionalText(4000),
  attributes: z.array(attributeSchema).max(60).optional(),
  experiences: z.array(experienceSchema).max(30).optional(),
  tags: z.array(trimmed(40)).max(30).optional(),
});

export const candidateUpdateSchema = candidateSchema.partial();

export const requirementSchema = z.object({
  kind: z.enum(['license', 'certification', 'skill', 'experience', 'education', 'language', 'other']),
  value: trimmed(120).min(1),
  is_required: z.boolean().optional().default(true),
  weight: z.number().min(0).max(5).optional().default(1),
});

export const jobSchema = z.object({
  title: trimmed(120).min(2, 'יש להזין שם משרה'),
  client_id: optionalText(60),
  headcount: z.coerce.number().int().min(1).max(999).optional().default(1),
  city: optionalText(60),
  region: optionalText(40),
  salary_min: optionalNumber,
  salary_max: optionalNumber,
  salary_period: z.enum(['month', 'hour', 'year']).optional().default('month'),
  hours: optionalText(80),
  work_days: optionalText(80),
  employment_type: optionalText(30),
  description: optionalText(6000),
  benefits: optionalText(2000),
  status: z.enum(['open', 'sourcing', 'on_hold', 'frozen', 'closed']).optional().default('open'),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional().default('normal'),
  deadline: optionalText(30),
  fee_type: z.enum(['percent', 'fixed']).optional().default('percent'),
  fee_value: optionalNumber,
  requirements: z.array(requirementSchema).max(40).optional(),
  tags: z.array(trimmed(40)).max(30).optional(),
});

export const jobUpdateSchema = jobSchema.partial();

export const contactSchema = z.object({
  name: trimmed(80).min(1, 'יש להזין שם'),
  role: optionalText(80),
  phone: optionalText(30),
  email: optionalText(120),
  is_primary: z.boolean().optional().default(false),
  notes: optionalText(1000),
});

export const clientSchema = z.object({
  name: trimmed(120).min(2, 'יש להזין שם חברה'),
  industry: optionalText(80),
  city: optionalText(60),
  address: optionalText(160),
  phone: optionalText(30),
  email: optionalText(120),
  website: optionalText(160),
  status: z.enum(['lead', 'active', 'paused', 'archived']).optional().default('active'),
  fee_type: z.enum(['percent', 'fixed']).optional().default('percent'),
  fee_value: optionalNumber,
  payment_terms_days: optionalNumber,
  notes: optionalText(4000),
  contacts: z.array(contactSchema).max(20).optional(),
});

export const clientUpdateSchema = clientSchema.partial();

export const applicationSchema = z.object({
  candidate_id: trimmed(60).min(1),
  job_id: trimmed(60).min(1),
  stage_key: optionalText(40),
  source: optionalText(40),
});

export const stageMoveSchema = z.object({
  stage_key: trimmed(40).min(1),
  reason: optionalText(300),
});

export const taskSchema = z.object({
  title: trimmed(160).min(2, 'יש להזין כותרת'),
  details: optionalText(2000),
  due_at: optionalText(40),
  remind_at: optionalText(40),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional().default('normal'),
  status: z.enum(['open', 'done', 'cancelled']).optional(),
  candidate_id: optionalText(60),
  client_id: optionalText(60),
  job_id: optionalText(60),
  application_id: optionalText(60),
});

export const taskUpdateSchema = taskSchema.partial();

export const interviewSchema = z.object({
  candidate_id: trimmed(60).min(1),
  job_id: optionalText(60),
  application_id: optionalText(60),
  kind: z.enum(['phone', 'recruiter', 'client', 'technical']).optional().default('recruiter'),
  scheduled_at: trimmed(40).min(1, 'יש לבחור מועד'),
  duration_minutes: z.coerce.number().int().min(5).max(600).optional().default(45),
  location: optionalText(160),
  interviewer: optionalText(80),
  status: z.enum(['scheduled', 'completed', 'cancelled', 'no_show']).optional(),
  outcome: optionalText(30),
  feedback: optionalText(3000),
});

export const interviewUpdateSchema = interviewSchema.partial();

export const messageSchema = z.object({
  channel: z.enum(['whatsapp', 'sms', 'email', 'call', 'note']),
  candidate_id: optionalText(60),
  client_id: optionalText(60),
  client_contact_id: optionalText(60),
  job_id: optionalText(60),
  subject: optionalText(200),
  body: trimmed(8000).min(1, 'יש להזין תוכן'),
  send: z.boolean().optional().default(false),
});

export const noteSchema = z.object({
  body: trimmed(4000).min(1, 'יש להזין תוכן'),
  candidate_id: optionalText(60),
  client_id: optionalText(60),
  job_id: optionalText(60),
  application_id: optionalText(60),
});

export const placementSchema = z.object({
  application_id: optionalText(60),
  candidate_id: trimmed(60).min(1),
  job_id: trimmed(60).min(1),
  start_date: trimmed(30).min(1, 'יש לבחור תאריך התחלה'),
  salary: optionalNumber,
  fee_type: z.enum(['percent', 'fixed']).optional(),
  fee_value: optionalNumber,
  guarantee_days: optionalNumber,
  notes: optionalText(2000),
  create_payment: z.boolean().optional().default(true),
});

export const placementUpdateSchema = z.object({
  status: z.enum(['active', 'guarantee', 'completed', 'fallen_through']).optional(),
  start_date: optionalText(30),
  salary: optionalNumber,
  fee_value: optionalNumber,
  notes: optionalText(2000),
});

export const paymentSchema = z.object({
  placement_id: optionalText(60),
  client_id: trimmed(60).min(1),
  amount: z.coerce.number().min(0),
  status: z.enum(['expected', 'invoiced', 'paid', 'overdue', 'written_off']).optional().default('expected'),
  due_date: optionalText(30),
  invoice_number: optionalText(60),
  paid_at: optionalText(30),
  method: optionalText(40),
  notes: optionalText(1000),
});

export const paymentUpdateSchema = paymentSchema.partial();

export const stageSchema = z.object({
  key: trimmed(40).min(1).regex(/^[a-z0-9_]+$/, 'מפתח באנגלית ובאותיות קטנות בלבד'),
  label: trimmed(40).min(1),
  color: optionalText(20),
  in_pipeline: z.boolean().optional().default(true),
  is_terminal: z.boolean().optional().default(false),
  outcome: z.enum(['positive', 'negative', 'neutral']).optional().default('neutral'),
  sort_order: z.coerce.number().int().min(0).max(999).optional(),
});

export const stageUpdateSchema = stageSchema.partial().omit({ key: true });

export const automationUpdateSchema = z.object({
  is_enabled: z.boolean().optional(),
  name: optionalText(120),
  description: optionalText(400),
  delay_minutes: z.coerce.number().int().min(0).max(60 * 24 * 60).optional(),
  action_config: z.record(z.unknown()).optional(),
});

export const searchSchema = z.object({
  q: z.string().trim().max(200).optional().default(''),
  limit: z.coerce.number().int().min(1).max(50).optional().default(8),
});

export const matchQuerySchema = z.object({
  min_score: z.coerce.number().min(0).max(100).optional().default(0),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const generateMessageSchema = z.object({
  candidate_id: trimmed(60).min(1),
  job_id: optionalText(60),
  tone: z.enum(['short', 'professional', 'friendly', 'urgent', 'followup']).optional().default('professional'),
  channel: z.enum(['whatsapp', 'sms', 'email']).optional().default('whatsapp'),
});

export const chatSchema = z.object({
  message: trimmed(1000).min(1, 'יש להזין שאלה'),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) }))
    .max(20)
    .optional()
    .default([]),
});

export type CandidateInput = z.infer<typeof candidateSchema>;
export type JobInput = z.infer<typeof jobSchema>;
export type ClientInput = z.infer<typeof clientSchema>;
export type TaskInput = z.infer<typeof taskSchema>;
export type MessageInput = z.infer<typeof messageSchema>;
export type PlacementInput = z.infer<typeof placementSchema>;
