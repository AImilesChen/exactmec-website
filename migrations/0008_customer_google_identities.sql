CREATE TABLE IF NOT EXISTS customer_google_identities (
  subject_hash TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS customer_google_email ON customer_google_identities(email_hash);
ALTER TABLE customer_sessions ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'email' CHECK(auth_provider IN ('email','google'));
ALTER TABLE customer_sessions ADD COLUMN google_subject_hash TEXT;
