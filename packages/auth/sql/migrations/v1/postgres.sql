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

CREATE INDEX IF NOT EXISTS auth_accounts_user_id_idx ON auth_accounts (user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions (user_id);
