# Changelog

All notable changes to `@pureq/auth` are documented in this file.

## [Unreleased]

### Added (Unreleased)

- Passkey (WebAuthn) provider support via `passkeyProvider`, including one-time challenge lifecycle and sign-counter rollback protection.
- Adapter contracts and implementations for WebAuthn authenticators (`create/get/list/update/delete`) in in-memory and SQL adapters.
- SQL migration/template support for `auth_authenticators` and `auth_password_credentials` in PostgreSQL and MySQL.
- OIDC provider token auto-refresh helpers:
  - `refreshOIDCAccountIfNeeded`
  - `refreshStoredOIDCAccountIfNeeded`
- Adapter account read/update contracts (`getAccount`, `updateAccount`) for persisted OAuth/OIDC account token lifecycle operations.
- Adapter readiness gates for production policy checks:
  - `requirePasswordAuthSupport`
  - `requirePasskeySupport`

### Changed (Unreleased)

- `linkAccount` handling is now idempotent in reference adapters and updates existing records on repeated provider callback/account-link writes.
- Core account-link flow updates persisted account token fields when adapter account-update support is available.
- Documentation updated to include Passkey/WebAuthn and OIDC auto-refresh operational guidance.
