CREATE TABLE IF NOT EXISTS customer_auth_challenges (
  challenge_hash TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  eligible INTEGER NOT NULL CHECK(eligible IN (0,1)),
  delivery_state TEXT NOT NULL CHECK(delivery_state IN ('pending','accepted','failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0 AND attempts <= 5),
  consumed_at INTEGER,
  mutation_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS customer_challenge_expiry ON customer_auth_challenges(expires_at);
CREATE INDEX IF NOT EXISTS customer_challenge_email ON customer_auth_challenges(email_hash,created_at);

CREATE TABLE IF NOT EXISTS customer_sessions (
  token_hash TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS customer_session_expiry ON customer_sessions(expires_at);
CREATE INDEX IF NOT EXISTS customer_session_owner ON customer_sessions(email_hash,expires_at);

CREATE TABLE IF NOT EXISTS customer_rate_buckets (
  bucket_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS customer_rate_expiry ON customer_rate_buckets(expires_at);

CREATE TABLE IF NOT EXISTS customer_inquiry_state (
  reference TEXT PRIMARY KEY REFERENCES leads(reference) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  withdrawn_at TEXT,
  mutation_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_supplements (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL REFERENCES leads(reference) ON DELETE CASCADE,
  note TEXT NOT NULL CHECK(length(note) >= 1 AND length(note) <= 4000),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS customer_supplement_inquiry ON customer_supplements(reference,created_at,id);
CREATE INDEX IF NOT EXISTS leads_customer_owner ON leads(email_hash,created_at DESC,reference);
