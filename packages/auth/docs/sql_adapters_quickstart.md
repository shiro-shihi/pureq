# SQL Adapters Quickstart (PostgreSQL / MySQL)

This guide gives an Auth.js-like fast path when you want to use a real SQL backend.

## What is included

- PostgreSQL adapter constructor: createPostgresAdapter
- MySQL adapter constructor: createMySqlAdapter
- Driver executors: createPostgresExecutor, createMySqlExecutor
- Ready-to-run schema statements: getSqlSchemaStatements
- Password credential storage table support (`auth_password_credentials`)
- Passkey/WebAuthn authenticator storage table support (`auth_authenticators`)

## 1) PostgreSQL setup

Install pg in your app:

pnpm add pg

Create adapter:

```ts
import { Pool } from "pg";
import { createAuth, createPostgresAdapter, getSqlSchemaStatements } from "@pureq/auth";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = createPostgresAdapter(pool);

for (const sql of getSqlSchemaStatements("postgres")) {
  await pool.query(sql);
}

const auth = createAuth({
  adapter,
  // providers, callbacks, etc
});
```

## 2) MySQL setup

Install mysql2 in your app:

pnpm add mysql2

Create adapter:

```ts
import mysql from "mysql2/promise";
import { createAuth, createMySqlAdapter, getSqlSchemaStatements } from "@pureq/auth";

const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  connectionLimit: 10,
});

const adapter = createMySqlAdapter(pool);

for (const sql of getSqlSchemaStatements("mysql")) {
  await pool.execute(sql);
}

const auth = createAuth({
  adapter,
  // providers, callbacks, etc
});
```

## 3) Optional custom table names

```ts
const adapter = createPostgresAdapter(pool, {
  tableNames: {
    users: "app_users",
    accounts: "app_accounts",
    sessions: "app_sessions",
    verificationTokens: "app_verification_tokens",
  },
});
```

## Operational notes

- Keep unique constraints on (provider, provider_account_id) and email.
- Keep passkey authenticator credential IDs unique.
- Verification tokens are consumed as one-time tokens.
- For strict one-time semantics under high concurrency, use transactions and row-level locking in your app migration strategy.
- Run contract and security tests after swapping adapters.

## Production readiness gate example

```ts
import { assessAdapterReadiness } from "@pureq/auth";

const readiness = assessAdapterReadiness(adapter, {
  deployment: "production",
  requireEmailProviderSupport: true,
  requirePasswordAuthSupport: true,
  requirePasskeySupport: true,
});

if (readiness.status !== "ready") {
  throw new Error(`adapter readiness failed: ${readiness.status}`);
}
```

## Versioned migration templates

Use the built-in SQL migration templates as a starting point:

- PostgreSQL: `sql/migrations/v1/postgres.sql`
- MySQL: `sql/migrations/v1/mysql.sql`

Pair these templates with adapter capability checks (`probeAdapterCapabilities`) during environment boot validation.
