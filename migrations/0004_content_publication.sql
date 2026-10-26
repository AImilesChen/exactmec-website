CREATE TABLE IF NOT EXISTS content_publications (
  page_id TEXT PRIMARY KEY,
  original_path TEXT NOT NULL UNIQUE,
  path TEXT NOT NULL UNIQUE,
  source_hash TEXT NOT NULL,
  content_json TEXT NOT NULL,
  draft_revision INTEGER NOT NULL,
  revision INTEGER NOT NULL CHECK(revision >= 1),
  state TEXT NOT NULL CHECK(state IN ('published','withdrawn')),
  mutation_id TEXT NOT NULL,
  published_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS content_aliases (
  path TEXT PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES content_publications(page_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS content_publication_audit (
  id TEXT PRIMARY KEY,
  actor_hash TEXT NOT NULL,
  page_hash TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('published','withdrawn','settings_updated')),
  revision INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS content_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  settings_json TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision >= 1),
  mutation_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
