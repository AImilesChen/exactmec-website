PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS leads (
  reference TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  phone_hash TEXT NOT NULL,
  review_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  mutation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS leads_created ON leads(created_at DESC, reference);
CREATE TABLE IF NOT EXISTS consent_receipts (
  reference TEXT PRIMARY KEY REFERENCES leads(reference) ON DELETE CASCADE,
  receipt_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notification_outbox (
  reference TEXT PRIMARY KEY REFERENCES leads(reference) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','failed','disabled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lead_history (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL REFERENCES leads(reference) ON DELETE CASCADE,
  action TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  actor_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS history_reference ON lead_history(reference, created_at);
CREATE TABLE IF NOT EXISTS contact_suppression (
  contact_hash TEXT NOT NULL,
  channel TEXT NOT NULL CHECK(channel IN ('all','whatsapp')),
  created_at TEXT NOT NULL,
  PRIMARY KEY(contact_hash, channel)
);
CREATE TABLE IF NOT EXISTS rate_buckets (
  bucket_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_expiry ON rate_buckets(expires_at);
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  reference TEXT,
  actor_hash TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
