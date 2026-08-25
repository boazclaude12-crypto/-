-- Recruiter OS — core relational schema.
-- Every business table carries org_id; all repository queries are scoped by it.

CREATE TABLE users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  name           TEXT NOT NULL,
  phone          TEXT,
  locale         TEXT NOT NULL DEFAULT 'he',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  last_login_at  TEXT
);

CREATE TABLE organizations (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  owner_user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency       TEXT NOT NULL DEFAULT 'ILS',
  timezone       TEXT NOT NULL DEFAULT 'Asia/Jerusalem',
  onboarded_at   TEXT,
  created_at     TEXT NOT NULL
);

-- Single-member in the MVP; the table exists so teams can be added without a rewrite.
CREATE TABLE memberships (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'owner',
  created_at TEXT NOT NULL,
  UNIQUE (org_id, user_id)
);

CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  last_seen_at TEXT,
  user_agent  TEXT,
  ip          TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- Customisable pipeline / candidate statuses.
CREATE TABLE stages (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  label       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  color       TEXT NOT NULL DEFAULT 'slate',
  in_pipeline INTEGER NOT NULL DEFAULT 1,   -- shows as a kanban column
  is_terminal INTEGER NOT NULL DEFAULT 0,
  outcome     TEXT NOT NULL DEFAULT 'neutral', -- positive | negative | neutral
  is_system   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  UNIQUE (org_id, key)
);

CREATE TABLE clients (
  id                 TEXT PRIMARY KEY,
  org_id             TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  industry           TEXT,
  city               TEXT,
  address            TEXT,
  phone              TEXT,
  email              TEXT,
  website            TEXT,
  status             TEXT NOT NULL DEFAULT 'active', -- active | paused | archived | lead
  fee_type           TEXT NOT NULL DEFAULT 'percent', -- percent | fixed
  fee_value          REAL NOT NULL DEFAULT 12,
  payment_terms_days INTEGER NOT NULL DEFAULT 30,
  notes              TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX idx_clients_org ON clients(org_id, name);

CREATE TABLE client_contacts (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id  TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  role       TEXT,
  phone      TEXT,
  email      TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  notes      TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_contacts_client ON client_contacts(org_id, client_id);

CREATE TABLE candidates (
  id               TEXT PRIMARY KEY,
  org_id           TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  first_name       TEXT NOT NULL,
  last_name        TEXT NOT NULL DEFAULT '',
  phone            TEXT,
  whatsapp         TEXT,
  email            TEXT,
  region           TEXT,
  city             TEXT,
  current_role     TEXT,
  years_experience REAL,
  education        TEXT,
  current_salary   REAL,
  desired_salary   REAL,
  availability     TEXT,            -- immediate | two_weeks | month | later | unavailable
  available_from   TEXT,
  employment_type  TEXT,            -- full_time | part_time | shifts | freelance | temp
  source           TEXT,
  status_key       TEXT NOT NULL DEFAULT 'new',
  rating           INTEGER,
  notes            TEXT,
  search_text      TEXT NOT NULL DEFAULT '',
  last_contact_at  TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX idx_candidates_org ON candidates(org_id, updated_at DESC);
CREATE INDEX idx_candidates_status ON candidates(org_id, status_key);
CREATE INDEX idx_candidates_city ON candidates(org_id, city);
CREATE INDEX idx_candidates_search ON candidates(org_id, search_text);

-- Licences, certifications and skills stay relational so matching can query them.
CREATE TABLE candidate_attributes (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,   -- license | certification | skill | language
  value        TEXT NOT NULL,
  value_norm   TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_cand_attr ON candidate_attributes(org_id, candidate_id);
CREATE INDEX idx_cand_attr_lookup ON candidate_attributes(org_id, kind, value_norm);

CREATE TABLE candidate_experiences (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  company      TEXT NOT NULL,
  title        TEXT NOT NULL,
  start_date   TEXT,
  end_date     TEXT,
  is_current   INTEGER NOT NULL DEFAULT 0,
  description  TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_cand_exp ON candidate_experiences(org_id, candidate_id, sort_order);

CREATE TABLE candidate_documents (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'cv',
  file_name    TEXT NOT NULL,
  stored_name  TEXT NOT NULL,
  mime_type    TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL,
  text_content TEXT,
  parse_status TEXT NOT NULL DEFAULT 'pending', -- pending | parsed | unsupported | failed
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_cand_docs ON candidate_documents(org_id, candidate_id);

CREATE TABLE jobs (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id       TEXT REFERENCES clients(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  headcount       INTEGER NOT NULL DEFAULT 1,
  city            TEXT,
  region          TEXT,
  salary_min      REAL,
  salary_max      REAL,
  salary_period   TEXT NOT NULL DEFAULT 'month', -- month | hour | year
  hours           TEXT,
  work_days       TEXT,
  employment_type TEXT,
  description     TEXT,
  benefits        TEXT,
  status          TEXT NOT NULL DEFAULT 'open',  -- open | sourcing | on_hold | frozen | closed
  priority        TEXT NOT NULL DEFAULT 'normal',-- low | normal | high | urgent
  opened_at       TEXT NOT NULL,
  deadline        TEXT,
  closed_at       TEXT,
  fee_type        TEXT NOT NULL DEFAULT 'percent',
  fee_value       REAL NOT NULL DEFAULT 12,
  search_text     TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX idx_jobs_org ON jobs(org_id, status, updated_at DESC);
CREATE INDEX idx_jobs_client ON jobs(org_id, client_id);

CREATE TABLE job_requirements (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id      TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,   -- license | certification | skill | experience | education | language | other
  value       TEXT NOT NULL,
  value_norm  TEXT NOT NULL,
  is_required INTEGER NOT NULL DEFAULT 1,
  weight      REAL NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_job_req ON job_requirements(org_id, job_id);

CREATE TABLE applications (
  id               TEXT PRIMARY KEY,
  org_id           TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  candidate_id     TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id           TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  stage_key        TEXT NOT NULL DEFAULT 'new',
  status           TEXT NOT NULL DEFAULT 'active', -- active | rejected | withdrawn | placed
  source           TEXT,
  match_score      REAL,
  rejected_reason  TEXT,
  sent_to_client_at TEXT,
  client_feedback_at TEXT,
  stage_changed_at TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  UNIQUE (candidate_id, job_id)
);
CREATE INDEX idx_app_job ON applications(org_id, job_id, stage_key);
CREATE INDEX idx_app_candidate ON applications(org_id, candidate_id);

CREATE TABLE interviews (
  id             TEXT PRIMARY KEY,
  org_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  application_id TEXT REFERENCES applications(id) ON DELETE CASCADE,
  candidate_id   TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id         TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  kind           TEXT NOT NULL DEFAULT 'recruiter', -- phone | recruiter | client | technical
  scheduled_at   TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 45,
  location       TEXT,
  interviewer    TEXT,
  status         TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | completed | cancelled | no_show
  outcome        TEXT,  -- passed | failed | pending
  feedback       TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX idx_interviews_when ON interviews(org_id, scheduled_at);

CREATE TABLE tasks (
  id             TEXT PRIMARY KEY,
  org_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  details        TEXT,
  due_at         TEXT,
  remind_at      TEXT,
  priority       TEXT NOT NULL DEFAULT 'normal', -- low | normal | high | urgent
  status         TEXT NOT NULL DEFAULT 'open',   -- open | done | cancelled
  candidate_id   TEXT REFERENCES candidates(id) ON DELETE CASCADE,
  client_id      TEXT REFERENCES clients(id) ON DELETE CASCADE,
  job_id         TEXT REFERENCES jobs(id) ON DELETE CASCADE,
  application_id TEXT REFERENCES applications(id) ON DELETE CASCADE,
  created_by     TEXT NOT NULL DEFAULT 'user',   -- user | automation
  automation_id  TEXT,
  completed_at   TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX idx_tasks_due ON tasks(org_id, status, due_at);

CREATE TABLE messages (
  id                TEXT PRIMARY KEY,
  org_id            TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel           TEXT NOT NULL,  -- whatsapp | sms | email | call | note
  direction         TEXT NOT NULL DEFAULT 'out', -- out | in
  candidate_id      TEXT REFERENCES candidates(id) ON DELETE CASCADE,
  client_id         TEXT REFERENCES clients(id) ON DELETE CASCADE,
  client_contact_id TEXT REFERENCES client_contacts(id) ON DELETE SET NULL,
  job_id            TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  to_address        TEXT,
  subject           TEXT,
  body              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft', -- draft | queued | sent | delivered | failed | read
  provider          TEXT,
  provider_message_id TEXT,
  error             TEXT,
  sent_at           TEXT,
  created_at        TEXT NOT NULL
);
CREATE INDEX idx_messages_candidate ON messages(org_id, candidate_id, created_at DESC);
CREATE INDEX idx_messages_client ON messages(org_id, client_id, created_at DESC);

CREATE TABLE notes (
  id             TEXT PRIMARY KEY,
  org_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  body           TEXT NOT NULL,
  candidate_id   TEXT REFERENCES candidates(id) ON DELETE CASCADE,
  client_id      TEXT REFERENCES clients(id) ON DELETE CASCADE,
  job_id         TEXT REFERENCES jobs(id) ON DELETE CASCADE,
  application_id TEXT REFERENCES applications(id) ON DELETE CASCADE,
  author_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL
);
CREATE INDEX idx_notes_candidate ON notes(org_id, candidate_id, created_at DESC);

CREATE TABLE tags (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT 'slate',
  created_at TEXT NOT NULL,
  UNIQUE (org_id, name)
);

CREATE TABLE candidate_tags (
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  tag_id       TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (candidate_id, tag_id)
);
CREATE INDEX idx_cand_tags_tag ON candidate_tags(org_id, tag_id);

CREATE TABLE job_tags (
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id     TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  tag_id     TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (job_id, tag_id)
);
CREATE INDEX idx_job_tags_tag ON job_tags(org_id, tag_id);

CREATE TABLE placements (
  id             TEXT PRIMARY KEY,
  org_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  application_id TEXT REFERENCES applications(id) ON DELETE SET NULL,
  candidate_id   TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id         TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  client_id      TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  start_date     TEXT NOT NULL,
  salary         REAL,
  fee_type       TEXT NOT NULL DEFAULT 'percent',
  fee_value      REAL NOT NULL DEFAULT 12,
  fee_amount     REAL NOT NULL DEFAULT 0,
  currency       TEXT NOT NULL DEFAULT 'ILS',
  status         TEXT NOT NULL DEFAULT 'active', -- active | guarantee | completed | fallen_through
  guarantee_days INTEGER NOT NULL DEFAULT 90,
  guarantee_until TEXT,
  notes          TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX idx_placements_org ON placements(org_id, start_date DESC);

CREATE TABLE payments (
  id             TEXT PRIMARY KEY,
  org_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  placement_id   TEXT REFERENCES placements(id) ON DELETE CASCADE,
  client_id      TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  amount         REAL NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'ILS',
  status         TEXT NOT NULL DEFAULT 'expected', -- expected | invoiced | paid | overdue | written_off
  due_date       TEXT,
  invoice_number TEXT,
  paid_at        TEXT,
  method         TEXT,
  notes          TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX idx_payments_org ON payments(org_id, status, due_date);

CREATE TABLE automations (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key           TEXT NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  trigger_event TEXT NOT NULL,
  conditions    TEXT NOT NULL DEFAULT '{}',
  action_type   TEXT NOT NULL,  -- create_task | draft_message | create_reminder | set_status
  action_config TEXT NOT NULL DEFAULT '{}',
  delay_minutes INTEGER NOT NULL DEFAULT 0,
  is_enabled    INTEGER NOT NULL DEFAULT 1,
  is_system     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE (org_id, key)
);

CREATE TABLE automation_runs (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  trigger_event TEXT NOT NULL,
  entity_type   TEXT,
  entity_id     TEXT,
  payload       TEXT NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'pending', -- pending | done | failed | skipped | cancelled
  run_at        TEXT NOT NULL,
  executed_at   TEXT,
  result        TEXT,
  error         TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_runs_due ON automation_runs(org_id, status, run_at);

CREATE TABLE activity_events (
  id             TEXT PRIMARY KEY,
  org_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type           TEXT NOT NULL,
  actor          TEXT NOT NULL DEFAULT 'user', -- user | system | automation
  actor_user_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  candidate_id   TEXT REFERENCES candidates(id) ON DELETE CASCADE,
  client_id      TEXT REFERENCES clients(id) ON DELETE CASCADE,
  job_id         TEXT REFERENCES jobs(id) ON DELETE CASCADE,
  application_id TEXT REFERENCES applications(id) ON DELETE CASCADE,
  placement_id   TEXT REFERENCES placements(id) ON DELETE CASCADE,
  summary        TEXT NOT NULL,
  meta           TEXT NOT NULL DEFAULT '{}',
  created_at     TEXT NOT NULL
);
CREATE INDEX idx_activity_candidate ON activity_events(org_id, candidate_id, created_at DESC);
CREATE INDEX idx_activity_job ON activity_events(org_id, job_id, created_at DESC);
CREATE INDEX idx_activity_client ON activity_events(org_id, client_id, created_at DESC);
CREATE INDEX idx_activity_org ON activity_events(org_id, created_at DESC);

CREATE TABLE rate_limits (
  bucket       TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);
