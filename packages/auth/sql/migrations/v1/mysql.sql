-- @pureq/auth SQL migration template v1 (MySQL)
-- Apply in a transactional migration tool where supported by your environment.

CREATE TABLE IF NOT EXISTS auth_users (
  id VARCHAR(191) PRIMARY KEY,
  email VARCHAR(320) UNIQUE NULL,
  email_verified DATETIME NULL,
  name TEXT NULL,
  image TEXT NULL
);

CREATE TABLE IF NOT EXISTS auth_accounts (
  user_id VARCHAR(191) NOT NULL,
  type VARCHAR(32) NOT NULL,
  provider VARCHAR(191) NOT NULL,
  provider_account_id VARCHAR(191) NOT NULL,
  access_token TEXT NULL,
  refresh_token TEXT NULL,
  expires_at BIGINT NULL,
  token_type VARCHAR(64) NULL,
  scope TEXT NULL,
  id_token LONGTEXT NULL,
  PRIMARY KEY (provider, provider_account_id),
  INDEX auth_accounts_user_id_idx (user_id)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  session_token VARCHAR(191) PRIMARY KEY,
  user_id VARCHAR(191) NOT NULL,
  expires_at DATETIME NOT NULL,
  INDEX auth_sessions_user_id_idx (user_id)
);

CREATE TABLE IF NOT EXISTS auth_verification_tokens (
  identifier VARCHAR(320) NOT NULL,
  token VARCHAR(191) NOT NULL,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (identifier, token)
);
