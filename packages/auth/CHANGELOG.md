# Changelog

All notable changes to `@pureq/auth` are documented in this file.

## [1.0.0] - 2026-04-21

### Added (Zero-Trust Identity & Stable Release)

- **Zero-Trust Identity Model:**
  - Hardened OIDC/OAuth callbacks to ignore unverified URL parameters.
  - Mandatory backchannel exchange for all identity claims.
  - Secure state and PKCE `code_verifier` management via encrypted/secure cookies.
- **Explicit Profile Mapping:**
  - Introduced `mapProfile` hook in `AuthProvider` and `OIDCProviderDefinition` for pure-function data transformation.
  - Added `profileSchema` to `AuthConfig` for optional validation of mapped profiles using `@pureq/validation` or `@pureq/db` Schema DSL.
- **Standard Provider Library:**
  - Added 15+ built-in provider classes with strongly typed profile interfaces in `packages/auth/src/providers/`.
  - Supported providers: Google, Apple, Facebook, Microsoft (Entra ID), X (Twitter), GitHub, Discord, Okta, Auth0, Slack, LINE, Twitch, LinkedIn, GitLab, Amazon.
- **Enhanced Built-in Presets:**
  - Updated `createTopProviderPreset` with default mapping logic for all 15+ standard providers.
  - Normalized profile data (id, email, name, image) automatically when using presets.
- **Schema DSL Integration:**
  - Integrated `@pureq/db`'s new `t` alias for a more ergonomic schema definition experience in auth pipelines.
- **Stable API Baseline:**
  - Promoted `@pureq/auth` to 1.0.0, signaling production readiness for Zero-Trust authentication.

## [0.5.0] - 2026-04-20

### Added (Fortress Hardening Suite)

- **JWT Verification Core Hardening:**
  - Mandatory algorithm whitelisting to prevent Algorithm Confusion attacks.
  - Strict claim validation for `exp` (expiry), `nbf` (not before), `iss` (issuer), and `aud` (audience).
  - Universal Base64 support for consistent behavior across Node.js, Browsers, and Edge runtimes.
- **Open Redirect Protection:**
  - Integrated `AuthCore.validateCallbackUrl` into route handlers.
  - Enforced strict hostname whitelisting for `callbackUrl` and other redirection parameters.
- **CSRF Defense Hardening:**
  - Implemented 100% constant-time HMAC comparison (no early returns) to prevent length-leakage timing attacks.
  - Corrected `generateSecureId` numeric byte length usage in CSRF token generation.
- **Client-Side Storage Security:**
  - Added explicit XSS vulnerability warnings to `authLocalStorage` and `authSessionStorage`.
  - Documentation updated to strongly recommend `authCookieStore` (HttpOnly/Secure) for production.
- **Side-Channel Mitigation:**
  - Standardized on cryptographically secure random session IDs, eliminating `Math.random()`.

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

## [0.2.4]

### Changed (0.2.4)

- Updated build configuration to support TypeScript Project References.
- Switched `typecheck` script to use `tsc --build` for reliable monorepo module resolution.

## [0.2.3]

### Added (0.2.3)

- Initial production-aware authentication and session primitives.
