# @pureq/db

[![License](https://img.shields.io/badge/license-MIT-blue)](https://github.com/shiro-shihi/pureq)
[![Version](https://img.shields.io/npm/v/@pureq/db)](https://www.npmjs.com/package/@pureq/db)
![Edge Ready](https://img.shields.io/badge/Edge%20Ready-Cloudflare%20%7C%20Vercel-brightgreen)

[GitHub](https://github.com/shiro-shihi/pureq) | [npm](https://www.npmjs.com/package/@pureq/db) | [Documentation](./docs/README.md)

## The Ultimate Edge-Native Database Engine

**A hardened, portable database communication engine for every JavaScript runtime.**

@pureq/db is a zero-dependency, policy-first database layer that eliminates the friction between your database, your validation logic, and your security requirements. Built for the modern cloud, it provides pure TypeScript implementations of database wire protocols, enabling extreme security and performance on the Edge.

Stop duplicating schemas. Stop worrying about data leaks. Build with a hardened data layer.

## Why @pureq/db?

- **Zero Duplication**: Define your table once. Automatically generate TypeScript types, @pureq/validation schemas, and migrations.
- **Pureq Native Engine**: Zero-dependency, Pure TypeScript Postgres and MySQL drivers with full binary protocol support. **No Node.js globals, `process`, or `Buffer` polyfills required.**
- **Universal Portability**: Runs natively on Cloudflare Workers, Vercel Edge, Bun, Deno, and even the Browser (via proxy). Same code, any environment.
- **Hardened by Design**: Enforces Extended Query Protocols (Parse/Bind/Execute) at the wire level. User input never touches the SQL string, making SQL Injection attacks **practically impossible**.
- **Deep Policy Propagation**: Attach security policies (like `pii: true`) directly to columns. These policies flow through your entire stack, from the DB row to the final API response.

## Quick Start Demo

### 1. Define: Schema + Policy + Validation

```typescript
import { table, column } from "@pureq/db";

export const users = table("users", {
  id: column.string().primary(),
  name: column.string(),
  // PII is marked at the source. This policy is respected by the validation layer.
  email: column.string().unique().policy({ pii: true }),
  role: column.string().default("user"),
});
```

### 2. Connect: The Power of Pure TypeScript

The Pureq Native Driver works everywhere, from Node.js to the Edge.

```typescript
import { DB, PurePostgresDriver } from "@pureq/db";
import { users } from "./schema";

const db = new DB(new PurePostgresDriver(
  myTransport, // Low-level connection (WebSocket, fetch, WebTransport, etc.)
  {
    user: "postgres",
    database: "app_db",
    password: "secure_password"
  }
));

// Fully type-safe and injection-proof
const adminUsers = await db
  .select()
  .from(users)
  .where("role", "=", "admin") // Consistent SQL-style operators
  .execute();
```

### 3. Bridge: Instant API Contracts

```typescript
import { toValidationSchema } from "@pureq/db";
import { parse } from "@pureq/validation";

// userSchema inherits all database constraints and PII policies automatically
const userSchema = toValidationSchema(users);

// Validate any untrusted input against your actual database definition
const result = parse(userSchema, inputData);
```

## Comparison

| Feature | @pureq/db | Prisma | Drizzle | Kysely |
| :--- | :--- | :--- | :--- | :--- |
| **Edge Native** | **Native Protocols** | Via Proxy Only | Driver dependent | Driver dependent |
| **Validation Bridge** | **Built-in (Policy-aware)** | Manual | Manual | Manual |
| **Policy Propagation** | **Source -> API Output** | None | None | None |
| **Zero Polyfills** | **Yes (Pure TS)** | No (Rust/Node) | Usually no | Usually no |
| **Bundle Size** | **Ultra-light** | Large | Light | Light |

## Driver Ecosystem

| Driver | Environment | Implementation |
| :--- | :--- | :--- |
| **PurePostgresDriver** | **Any (Edge/Server/Browser)** | **Pureq Native (Binary Protocol)** |
| **PureMysqlDriver** | **Any (Edge/Server/Browser)** | **Pureq Native (Binary Protocol)** |
| NeonHttpDriver | Serverless / Edge | HTTP Native (via fetch) |
| CloudflareD1Driver | Cloudflare Workers | Native D1 Runtime |
| BetterSqlite3Driver | Node.js / Local | Wrapper (better-sqlite3) |
| PostgresDriver | Node.js / Server | Wrapper (pg) |

## Installation

```bash
pnpm add @pureq/db
```

---

MIT (c) Shihiro
