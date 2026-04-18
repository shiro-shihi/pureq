# @pureq/auth

@pureq/auth is the authentication and session layer for the pureq ecosystem.

It is designed to give teams both:

- a short, practical onboarding path for shipping auth quickly
- explicit policy control for security, runtime behavior, and operations

## Design Goals

- framework-neutral core that works across browser, SSR/BFF, Node, and edge
- explicit security and lifecycle contracts instead of hidden auth behavior
- production-aware adapter and provider ergonomics
- migration tooling that turns cutover risk into measurable checks

## Comparison with Better Auth and Auth.js (NextAuth)

All three target modern TypeScript auth, but they optimize for different adoption and operations profiles.

| Concern | Better Auth (general tendency) | Auth.js / NextAuth (general tendency) | @pureq/auth |
| --- | --- | --- | --- |
| Primary orientation | framework/app integration speed | Next.js-centric ecosystem with broad adoption history | policy-explicit, framework-neutral core |
| Default developer flow | batteries-included framework DX | strong Next.js onboarding and established provider patterns | AuthKit/Starter fast path plus explicit lower-level control |
| Runtime model | framework-focused server flows | primarily Next.js server/client integration surface | browser, SSR/BFF, Node, and edge with shared primitives |
| Security visibility | secure defaults in framework context | battle-tested defaults with framework conventions | explicit mode-based defaults and policy override diagnostics |
| Adapter production gate | adapter usage depends on app checks | adapter ecosystem maturity is strong, readiness checks are app-defined | built-in readiness assessment (`probe` + `assess`) |
| Migration support | docs-driven migration | migration mostly docs/conventions and ecosystem tooling | diagnostics APIs and cutover/rollback checklist generation |

Use Better Auth when tight framework-native velocity is the top priority.

Use Auth.js/NextAuth when Next.js ecosystem fit and long adoption history are the primary decision factors.

Use @pureq/auth when you need one auth core with explicit policy boundaries, deployment-readiness gates, and migration telemetry across mixed runtimes.

## What Is Included

### Core construction APIs

- createAuth
- createAuthKit
- createAuthStarter

### Route and framework integration

- createAuthRouteHandlerRecipe
- createAuthServerActionRecipe
- createAuthFrameworkContext
- createAuthRequestAdapter
- createNextAuthKitPack
- createExpressAuthKitPack
- createFastifyAuthKitPack
- createReactAuthKitBootstrapPack

### Session and state lifecycle

- createAuthSessionManager
- createAuthSessionStore
- createReactAuthHooks
- createVueAuthSessionComposable
- createBufferedSessionEventExporter
- composeSessionEventAudits
- createConsoleSessionEventAudit

### Providers and OIDC

- credentialsProvider
- emailProvider
- createTopProviderPreset
- listTopProviderPresets
- createOIDCFlow
- createOIDCFlowFromProvider
- oidcProviders
- validateProviderCallbackContract
- normalizeProviderError
- PROVIDER_ERROR_NORMALIZATION_TABLE

### Adapters and SQL

- createInMemoryAdapter
- createPostgresAdapter
- createMySqlAdapter
- createSqlAdapter
- createPostgresExecutor
- createMySqlExecutor
- getSqlSchemaStatements
- probeAdapterCapabilities
- assessAdapterReadiness

### Security controls

- createAuthCsrfProtection
- withCsrfProtection
- createAuthRevocationRegistry
- withRevocationGuard
- authEncryptedStore
- createAuthEncryption
- verifyJwt

### Migration and diagnostics

- normalizeLegacyAuthTokens
- migrateLegacyTokensToStore
- hydrateSessionManagerFromLegacy
- analyzeAuthMigration
- formatMigrationParityReport
- generateMigrationChecklists

## Installation

```bash
pnpm add @pureq/auth
```

## Quick Start (Recommended)

For the shortest implementation path, start from createAuthStarter.

```ts
import { createAuthStarter, createInMemoryAdapter, credentialsProvider } from "@pureq/auth";
import { verify } from "argon2";

async function verifyPassword(email: string, password: string): Promise<{ id: string; email: string } | null> {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    return null;
  }

  const ok = await verify(user.passwordHash, password);
  return ok ? { id: user.id, email: user.email } : null;
}

const starter = await createAuthStarter({
  security: { mode: "ssr-bff" },
  adapter: createInMemoryAdapter(),
  providers: [
    credentialsProvider({
      authorize: async (credentials) => {
        return verifyPassword(credentials.username, credentials.password);
      },
    }),
  ],
});

export const handlers = starter.kit.handlers;
```

## AuthKit-First Setup

If you want explicit assembly while keeping strong defaults, use createAuthKit.

```ts
import { createAuthKit, createInMemoryAdapter } from "@pureq/auth";

const kit = createAuthKit({
  security: { mode: "ssr-bff" },
  adapter: createInMemoryAdapter(),
});

export const { handleSignIn, handleCallback, handleSession, handleSignOut } = kit.handlers;
```

## Providers

Top-provider presets and generic OIDC helpers are available.

```ts
import { createTopProviderPreset, listTopProviderPresets } from "@pureq/auth";

const supported = listTopProviderPresets();
const google = createTopProviderPreset("google");
```

Built-in top presets include:

- google
- github
- microsoft
- auth0
- apple
- okta
- keycloak
- cognito
- gitlab
- discord
- slack
- generic

## SQL Adapters and Readiness

```ts
import {
  createPostgresAdapter,
  getSqlSchemaStatements,
  assessAdapterReadiness,
} from "@pureq/auth";

const adapter = createPostgresAdapter(pgPool);
const report = assessAdapterReadiness(adapter, {
  deployment: "production",
  requireEmailProviderSupport: true,
});

if (report.status !== "ready") {
  throw new Error(`adapter not ready: ${report.status}`);
}

for (const sql of getSqlSchemaStatements("postgres")) {
  await pgPool.query(sql);
}
```

Versioned SQL templates are included in:

- [PostgreSQL v1 template](https://github.com/shiro-shihi/pureq/blob/main/packages/auth/sql/migrations/v1/postgres.sql)
- [MySQL v1 template](https://github.com/shiro-shihi/pureq/blob/main/packages/auth/sql/migrations/v1/mysql.sql)

## Security Model

### Automatic behavior

- OIDC callback replay protection with TTL cache
- JWT verification hardening (no alg:none acceptance)
- secure cookie defaults in cookie-backed flows

### Opt-in behavior

- CSRF middleware for browser-mutating endpoints
- revocation guard for jti/sid/sub invalidation
- encrypted token storage
- broadcast sync for multi-tab state propagation

### Encryption key management

- `createAuthEncryption(secret)` requires at least 256-bit key material (32+ bytes).
- Keep secrets in environment variables or managed secret stores (Vercel / AWS SSM / Doppler).
- Plan periodic key rotation in operations; current encrypted payload compatibility is single-key.
- Default PBKDF2 iterations is `100_000`; for password-derived secrets, consider `600_000+`.

### Runtime-mode defaults

Security defaults are mode-aware:

- browser-spa
- ssr-bff
- edge

Policy overrides are diagnosable through onPolicyOverride hooks.

## Migration Workflow

Migration helpers are provided for:

- legacy token normalization
- store/session hydration
- parity report generation
- cutover and rollback checklist generation

Starter can run adapter preflight at process boot and fail early on blocked readiness.

## Framework and Runtime Coverage

Core primitives are framework-neutral.

Thin packs and recipes are provided for:

- Next.js
- Express
- Fastify
- React bootstrap
- SSR/BFF bridge patterns
- edge-compatible context and response handoff

## Documentation

- [Documentation Index](https://github.com/shiro-shihi/pureq/blob/main/packages/auth/docs/README.md)
- [Package Overview](https://github.com/shiro-shihi/pureq/blob/main/packages/auth/docs/auth_package.md)
- [AuthKit Quickstart](https://github.com/shiro-shihi/pureq/blob/main/packages/auth/docs/authkit_quickstart.md)
- [Auth Starter](https://github.com/shiro-shihi/pureq/blob/main/packages/auth/docs/auth_starter.md)
- [Implementation Examples](https://github.com/shiro-shihi/pureq/blob/main/packages/auth/docs/implementation_examples.md)
- [Framework Packs](https://github.com/shiro-shihi/pureq/blob/main/packages/auth/docs/framework_packs.md)
- [Framework Adapters](https://github.com/shiro-shihi/pureq/blob/main/packages/auth/docs/framework_adapters.md)
- [Framework Hooks](https://github.com/shiro-shihi/pureq/blob/main/packages/auth/docs/framework_hooks.md)
- [Security Controls](https://github.com/shiro-shihi/pureq/blob/main/packages/auth/docs/security_controls.md)
- [Session Event Operations](https://github.com/shiro-shihi/pureq/blob/main/packages/auth/docs/session_event_operations.md)
- [SSR Bridge](https://github.com/shiro-shihi/pureq/blob/main/packages/auth/docs/ssr_bridge.md)
- [SQL Adapters Quickstart](https://github.com/shiro-shihi/pureq/blob/main/packages/auth/docs/sql_adapters_quickstart.md)
- [Adapter Compatibility Matrix](https://github.com/shiro-shihi/pureq/blob/main/packages/auth/docs/adapter_compatibility_matrix.md)
- [Adapter Harness](https://github.com/shiro-shihi/pureq/blob/main/packages/auth/docs/adapter_harness.md)
- [Provider Priorities](https://github.com/shiro-shihi/pureq/blob/main/packages/auth/docs/provider_priorities.md)
- [Provider Error Normalization](https://github.com/shiro-shihi/pureq/blob/main/packages/auth/docs/provider_error_normalization.md)
- [Migration Guide](https://github.com/shiro-shihi/pureq/blob/main/packages/auth/docs/migration_guide.md)
- [Migration Playbook](https://github.com/shiro-shihi/pureq/blob/main/packages/auth/docs/migration_playbook.md)
- [Templates and Presets](https://github.com/shiro-shihi/pureq/blob/main/packages/auth/docs/templates_and_presets.md)
- [Event Adapters](https://github.com/shiro-shihi/pureq/blob/main/packages/auth/docs/event_adapters.md)
- [Error Code Reference](https://github.com/shiro-shihi/pureq/blob/main/packages/auth/docs/error_code_reference.md)

## Testing

```bash
pnpm --filter @pureq/auth test:unit
pnpm --filter @pureq/auth test:contract
pnpm --filter @pureq/auth test:integration
```

## License

MIT © Shihiro
