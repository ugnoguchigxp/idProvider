CREATE TABLE IF NOT EXISTS oidc_provider_states (
  model varchar(128) NOT NULL,
  id text NOT NULL,
  payload jsonb NOT NULL,
  grant_id text,
  user_code text,
  uid text,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oidc_provider_states_model_id_key UNIQUE (model, id)
);

CREATE INDEX IF NOT EXISTS oidc_provider_states_expires_at_idx
  ON oidc_provider_states (expires_at);

CREATE INDEX IF NOT EXISTS oidc_provider_states_grant_id_idx
  ON oidc_provider_states (grant_id);

CREATE INDEX IF NOT EXISTS oidc_provider_states_uid_idx
  ON oidc_provider_states (uid);

CREATE INDEX IF NOT EXISTS oidc_provider_states_user_code_idx
  ON oidc_provider_states (user_code);
