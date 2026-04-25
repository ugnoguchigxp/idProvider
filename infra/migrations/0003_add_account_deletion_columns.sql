ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_due_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS users_deletion_due_at_idx
  ON users(deletion_due_at)
  WHERE status = 'deleted';
