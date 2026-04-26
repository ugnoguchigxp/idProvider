ALTER TABLE signing_keys
  ADD COLUMN IF NOT EXISTS rotation_reason VARCHAR(64),
  ADD COLUMN IF NOT EXISTS rotated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS signing_keys_is_active_idx ON signing_keys(is_active);
CREATE INDEX IF NOT EXISTS signing_keys_expires_at_idx ON signing_keys(expires_at);
CREATE INDEX IF NOT EXISTS signing_keys_revoked_at_idx ON signing_keys(revoked_at);
