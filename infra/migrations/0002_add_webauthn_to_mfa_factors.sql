-- Add name and webauthn_data columns to mfa_factors
ALTER TABLE mfa_factors ADD COLUMN name VARCHAR(128);
ALTER TABLE mfa_factors ADD COLUMN webauthn_data JSONB;

-- Make secret nullable
ALTER TABLE mfa_factors ALTER COLUMN secret DROP NOT NULL;

-- Add index on user_id for faster lookups
CREATE INDEX mfa_factors_user_id_idx ON mfa_factors(user_id);
