-- @pureq/auth SQL migration template v1 (PostgreSQL)
-- Apply in a transactional migration tool where possible.

CREATE TABLE IF NOT EXISTS auth_users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  email_verified TIMESTAMPTZ NULL,
  name TEXT NULL,
  image TEXT NULL
);

CREATE TABLE IF NOT EXISTS auth_accounts (
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  access_token TEXT NULL,
  refresh_token TEXT NULL,
  expires_at BIGINT NULL,
  token_type TEXT NULL,
  scope TEXT NULL,
  id_token TEXT NULL,
  PRIMARY KEY (provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  session_token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_verification_tokens (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (identifier, token)
);

CREATE TABLE IF NOT EXISTS auth_password_credentials (
  user_id TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  algorithm TEXT NOT NULL,
  iterations INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_authenticators (
  credential_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT NULL,
  backed_up BOOLEAN NULL,
  device_type TEXT NULL,
  aaguid TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS auth_accounts_user_id_idx ON auth_accounts (user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS auth_authenticators_user_id_idx ON auth_authenticators (user_id);
