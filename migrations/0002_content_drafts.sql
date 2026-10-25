CREATE TABLE IF NOT EXISTS content_drafts (
  page_id TEXT PRIMARY KEY,
  source_hash TEXT NOT NULL,
  patch_json TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision >= 1),
  mutation_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS content_audit (
  id TEXT PRIMARY KEY,
  actor_hash TEXT NOT NULL,
  page_hash TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('viewed','saved','exported')),
  revision INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS content_audit_page ON content_audit(page_hash,created_at);
