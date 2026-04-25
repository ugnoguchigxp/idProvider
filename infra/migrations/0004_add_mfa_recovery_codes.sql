CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL,
  lookup_hash TEXT NOT NULL UNIQUE,
  code_hash TEXT NOT NULL,
  last_chars VARCHAR(8) NOT NULL,
  used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mfa_recovery_codes_user_id_idx
  ON mfa_recovery_codes(user_id);

CREATE INDEX IF NOT EXISTS mfa_recovery_codes_active_batch_idx
  ON mfa_recovery_codes(user_id, batch_id)
  WHERE used_at IS NULL AND revoked_at IS NULL;
