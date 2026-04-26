CREATE TABLE IF NOT EXISTS oauth_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id VARCHAR(128) NOT NULL,
  name VARCHAR(160) NOT NULL,
  client_type VARCHAR(32) NOT NULL DEFAULT 'confidential',
  token_endpoint_auth_method VARCHAR(64) NOT NULL DEFAULT 'client_secret_basic',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  access_token_ttl_seconds INTEGER,
  refresh_token_ttl_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT oauth_clients_client_id_key UNIQUE(client_id)
);

CREATE INDEX IF NOT EXISTS oauth_clients_status_idx ON oauth_clients(status);

CREATE TABLE IF NOT EXISTS oauth_client_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_pk_id UUID NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  secret_hash TEXT NOT NULL,
  secret_hint VARCHAR(16) NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ,
  grace_until TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT oauth_client_secrets_grace_until_check CHECK (
    grace_until IS NULL OR grace_until >= created_at
  )
);

CREATE INDEX IF NOT EXISTS oauth_client_secrets_client_primary_idx
  ON oauth_client_secrets(client_pk_id, is_primary);
CREATE INDEX IF NOT EXISTS oauth_client_secrets_client_revoked_idx
  ON oauth_client_secrets(client_pk_id, revoked_at);

CREATE UNIQUE INDEX IF NOT EXISTS oauth_client_secrets_single_active_primary_idx
  ON oauth_client_secrets(client_pk_id)
  WHERE is_primary = true AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS oauth_client_redirect_uris (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_pk_id UUID NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT oauth_client_redirect_uris_client_uri_key UNIQUE(client_pk_id, redirect_uri)
);

CREATE TABLE IF NOT EXISTS oauth_client_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_pk_id UUID NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  scope VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT oauth_client_scopes_client_scope_key UNIQUE(client_pk_id, scope)
);

CREATE TABLE IF NOT EXISTS oauth_client_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_pk_id UUID REFERENCES oauth_clients(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oauth_client_audit_logs_client_created_at_idx
  ON oauth_client_audit_logs(client_pk_id, created_at DESC);
