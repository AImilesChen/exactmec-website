CREATE TABLE IF NOT EXISTS customer_inquiry_files (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL REFERENCES leads(reference) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 3 AND 150),
  size INTEGER NOT NULL CHECK(size BETWEEN 1 AND 20971520),
  extension TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS customer_inquiry_files_reference ON customer_inquiry_files(reference,created_at,id);
