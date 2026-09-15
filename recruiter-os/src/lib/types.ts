/** Row shapes as stored in SQLite. Booleans are 0/1 integers, timestamps ISO strings. */

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  phone: string | null;
  locale: string;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface OrganizationRow {
  id: string;
  name: string;
  owner_user_id: string;
  currency: string;
  timezone: string;
  onboarded_at: string | null;
  created_at: string;
}

export interface StageRow {
  id: string;
  org_id: string;
  key: string;
  label: string;
  sort_order: number;
  color: string;
  in_pipeline: number;
  is_terminal: number;
  outcome: 'positive' | 'negative' | 'neutral';
  is_system: number;
  created_at: string;
}

export interface ClientRow {
  id: string;
  org_id: string;
  name: string;
  industry: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  status: string;
  fee_type: 'percent' | 'fixed';
  fee_value: number;
  payment_terms_days: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientContactRow {
  id: string;
  org_id: string;
  client_id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  is_primary: number;
  notes: string | null;
  created_at: string;
}

export interface CandidateRow {
  id: string;
  org_id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  region: string | null;
  city: string | null;
  current_role: string | null;
  years_experience: number | null;
  education: string | null;
  current_salary: number | null;
  desired_salary: number | null;
  availability: string | null;
  available_from: string | null;
  employment_type: string | null;
  /** Commute this candidate accepts, in km. Null means "use the driving-based default". */
  max_commute_km: number | null;
  has_car: number;
  willing_to_relocate: number;
  source: string | null;
  status_key: string;
  rating: number | null;
  notes: string | null;
  search_text: string;
  last_contact_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CandidateAttributeRow {
  id: string;
  org_id: string;
  candidate_id: string;
  kind: string;
  value: string;
  value_norm: string;
  created_at: string;
}

export interface CandidateExperienceRow {
  id: string;
  org_id: string;
  candidate_id: string;
  company: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  is_current: number;
  description: string | null;
  sort_order: number;
  created_at: string;
}

export interface CandidateDocumentRow {
  id: string;
  org_id: string;
  candidate_id: string;
  kind: string;
  file_name: string;
  stored_name: string;
  mime_type: string;
  size_bytes: number;
  text_content: string | null;
  parse_status: 'pending' | 'parsed' | 'unsupported' | 'failed';
  created_at: string;
}

export interface JobRow {
  id: string;
  org_id: string;
  client_id: string | null;
  title: string;
  headcount: number;
  city: string | null;
  region: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: string;
  hours: string | null;
  work_days: string | null;
  employment_type: string | null;
  /** onsite | hybrid | remote — decides whether distance constrains the match at all. */
  work_mode: string;
  description: string | null;
  benefits: string | null;
  status: string;
  priority: string;
  opened_at: string;
  deadline: string | null;
  closed_at: string | null;
  fee_type: 'percent' | 'fixed';
  fee_value: number;
  search_text: string;
  created_at: string;
  updated_at: string;
}

export interface JobRequirementRow {
  id: string;
  org_id: string;
  job_id: string;
  kind: string;
  value: string;
  value_norm: string;
  is_required: number;
  weight: number;
  created_at: string;
}

export interface ApplicationRow {
  id: string;
  org_id: string;
  candidate_id: string;
  job_id: string;
  stage_key: string;
  status: 'active' | 'rejected' | 'withdrawn' | 'placed';
  source: string | null;
  match_score: number | null;
  rejected_reason: string | null;
  sent_to_client_at: string | null;
  client_feedback_at: string | null;
  stage_changed_at: string;
  created_at: string;
  updated_at: string;
}

export interface InterviewRow {
  id: string;
  org_id: string;
  application_id: string | null;
  candidate_id: string;
  job_id: string | null;
  kind: string;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  interviewer: string | null;
  status: string;
  outcome: string | null;
  feedback: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskRow {
  id: string;
  org_id: string;
  title: string;
  details: string | null;
  due_at: string | null;
  remind_at: string | null;
  priority: string;
  status: 'open' | 'done' | 'cancelled';
  candidate_id: string | null;
  client_id: string | null;
  job_id: string | null;
  application_id: string | null;
  created_by: string;
  automation_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  org_id: string;
  channel: string;
  direction: 'out' | 'in';
  candidate_id: string | null;
  client_id: string | null;
  client_contact_id: string | null;
  job_id: string | null;
  to_address: string | null;
  subject: string | null;
  body: string;
  status: string;
  provider: string | null;
  provider_message_id: string | null;
  error: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface NoteRow {
  id: string;
  org_id: string;
  body: string;
  candidate_id: string | null;
  client_id: string | null;
  job_id: string | null;
  application_id: string | null;
  author_user_id: string | null;
  created_at: string;
}

export interface TagRow {
  id: string;
  org_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface PlacementRow {
  id: string;
  org_id: string;
  application_id: string | null;
  candidate_id: string;
  job_id: string;
  client_id: string;
  start_date: string;
  salary: number | null;
  fee_type: 'percent' | 'fixed';
  fee_value: number;
  fee_amount: number;
  currency: string;
  status: string;
  guarantee_days: number;
  guarantee_until: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentRow {
  id: string;
  org_id: string;
  placement_id: string | null;
  client_id: string;
  amount: number;
  currency: string;
  status: string;
  due_date: string | null;
  invoice_number: string | null;
  paid_at: string | null;
  method: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationRow {
  id: string;
  org_id: string;
  key: string;
  name: string;
  description: string | null;
  trigger_event: string;
  conditions: string;
  action_type: string;
  action_config: string;
  delay_minutes: number;
  is_enabled: number;
  is_system: number;
  created_at: string;
  updated_at: string;
}

export interface AutomationRunRow {
  id: string;
  org_id: string;
  automation_id: string;
  trigger_event: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: string;
  status: string;
  run_at: string;
  executed_at: string | null;
  result: string | null;
  error: string | null;
  created_at: string;
}

export interface ActivityEventRow {
  id: string;
  org_id: string;
  type: string;
  actor: string;
  actor_user_id: string | null;
  candidate_id: string | null;
  client_id: string | null;
  job_id: string | null;
  application_id: string | null;
  placement_id: string | null;
  summary: string;
  meta: string;
  created_at: string;
}

export interface EmailAccountRow {
  id: string;
  org_id: string;
  email: string;
  host: string;
  port: number;
  secure: number;
  /** AES-256-GCM ciphertext — never the password itself. */
  password_enc: string;
  folder: string;
  /** Sending server; derived from the reading host when empty. */
  smtp_host: string | null;
  smtp_port: number;
  /** Local hour to send the daily brief at. Null means the brief is off. */
  digest_hour: number | null;
  last_digest_on: string | null;
  since_date: string | null;
  last_sync_at: string | null;
  last_status: string | null;
  last_error: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface EmailMessageRow {
  id: string;
  org_id: string;
  account_id: string;
  message_uid: string;
  message_id: string | null;
  subject: string | null;
  sender: string | null;
  received_at: string | null;
  /** imported | duplicate | no_attachment | unreadable | failed */
  status: string;
  candidate_id: string | null;
  job_title: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
}
