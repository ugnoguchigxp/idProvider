ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS prev_hash TEXT,
  ADD COLUMN IF NOT EXISTS entry_hash TEXT,
  ADD COLUMN IF NOT EXISTS integrity_version INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx
  ON audit_logs(created_at);

CREATE INDEX IF NOT EXISTS audit_logs_entry_hash_idx
  ON audit_logs(entry_hash);
