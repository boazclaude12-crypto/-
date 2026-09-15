-- Mailbox the system pulls applications from.
--
-- One per organisation for now: a freelance recruiter has one inbox where CVs land.
-- The password is stored encrypted, never in the clear — see src/lib/crypto.ts.
CREATE TABLE email_accounts (
  id             TEXT PRIMARY KEY,
  org_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email          TEXT NOT NULL,
  host           TEXT NOT NULL,
  port           INTEGER NOT NULL DEFAULT 993,
  secure         INTEGER NOT NULL DEFAULT 1,
  -- AES-256-GCM ciphertext of the app password, keyed off AUTH_SECRET.
  password_enc   TEXT NOT NULL,
  folder         TEXT NOT NULL DEFAULT 'INBOX',
  -- Nothing before this date is fetched, so connecting an old mailbox does not drag in
  -- years of history the recruiter never asked for.
  since_date     TEXT,
  last_sync_at   TEXT,
  last_status    TEXT,
  last_error     TEXT,
  enabled        INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_email_accounts_org ON email_accounts(org_id);

-- Every message the system has already looked at.
--
-- Kept separately from the candidate record because a message can legitimately produce
-- no candidate — no attachment, unreadable file, an applicant already on file — and it
-- still must not be processed a second time on the next sync.
CREATE TABLE email_messages (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  account_id    TEXT NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  message_uid   TEXT NOT NULL,
  message_id    TEXT,
  subject       TEXT,
  sender        TEXT,
  received_at   TEXT,
  status        TEXT NOT NULL,          -- imported | duplicate | no_attachment | unreadable | failed
  candidate_id  TEXT REFERENCES candidates(id) ON DELETE SET NULL,
  job_title     TEXT,
  reason        TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_email_messages_uid ON email_messages(org_id, account_id, message_uid);
CREATE INDEX idx_email_messages_created ON email_messages(org_id, created_at DESC);
