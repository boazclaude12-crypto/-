-- Outgoing mail rides on the same account already connected for reading, so the recruiter
-- supplies one credential rather than two, and the brief arrives from their own address.
ALTER TABLE email_accounts ADD COLUMN smtp_host TEXT;
ALTER TABLE email_accounts ADD COLUMN smtp_port INTEGER NOT NULL DEFAULT 465;

-- Local hour to send at. Null disables the brief without disconnecting the mailbox.
ALTER TABLE email_accounts ADD COLUMN digest_hour INTEGER;
ALTER TABLE email_accounts ADD COLUMN last_digest_on TEXT;
