# Adapter Compatibility Matrix

This draft defines compatibility expectations for `AuthDatabaseAdapter` implementations.

## Scope

- `@pureq/auth` core adapter contract
- baseline behavior needed for Auth.js-style migrations
- current reference implementation status (`createInMemoryAdapter`)

## Matrix

| Capability | Adapter contract method(s) | Required for migration parity | In-memory adapter status | Notes |
| --- | --- | --- | --- | --- |
| User create/read/update | `createUser`, `getUser`, `getUserByEmail`, `updateUser` | Yes | Supported | Required for all providers |
| User deletion | `deleteUser` | Recommended | Supported | Optional in interface; required for full lifecycle hygiene |
| Account lookup | `getUserByAccount` | Yes | Supported | Required for OIDC/account-link callbacks |
| Account linking | `linkAccount`, `unlinkAccount` | Yes (unlink recommended) | Supported | `unlinkAccount` optional in interface, but strongly recommended |
| Session create/read/update/delete | `createSession`, `getSessionAndUser`, `updateSession`, `deleteSession` | Yes | Supported | Session expiry handling is adapter-sensitive |
| Verification token create/use | `createVerificationToken`, `useVerificationToken` | Required for email provider flows | Supported | Optional in interface, required when email/magic-link is enabled |
| Expiry semantics | adapter-defined implementation detail | Yes | Partial | In-memory performs best-effort expiry checks, not durable cleanup |
| Durability across restarts | adapter-defined implementation detail | Usually required in prod | Not supported | In-memory is test/dev only |
| Concurrency safety | adapter-defined implementation detail | Yes for prod | Partial | Real DB adapters must enforce idempotency/uniqueness |
| Uniqueness constraints | adapter-defined implementation detail | Yes for prod | Partial | Enforce `(provider, providerAccountId)` uniqueness |

## Compatibility Levels

- Level A (Migration-ready): all parity-required methods implemented and validated under provider + session tests.
- Level B (Core-ready): core user/account/session methods implemented; verification tokens may be omitted if email provider is disabled.
- Level C (Dev-only): useful for tests and local development but missing production durability/concurrency guarantees.

`createInMemoryAdapter` currently targets Level C with broad API coverage and test utility.

## Readiness Assessment API

Use `assessAdapterReadiness(adapter, options)` to convert capability checks into go/no-go signals.

- `deployment: "development" | "production"` adjusts strictness.
- `requireEmailProviderSupport: true` blocks adapters that cannot support verification-token flows.
- output includes `status`, `blockers`, and `warnings` so CI or boot-time checks can fail fast.

## Minimum Production Adapter Guidance

- enforce unique indexes for user email and provider account identifiers
- make session token lookup and expiry checks deterministic
- treat `useVerificationToken` as one-time consume operation
- protect against duplicate account-link writes under concurrent callbacks
- instrument adapter failures so auth route handlers can map errors predictably

## Recommended Next Adapters

1. SQL adapter reference (PostgreSQL/MySQL class of backends)
2. SQLite adapter reference for single-node deployments
3. KV/Document adapter recipe with explicit consistency caveats

These references should include contract tests wired to the matrix rows above.
