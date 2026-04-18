# @pureq/db

Native-first, validation-integrated database driver and query builder for the Pureq ecosystem.

## Features

- **Native First**: Custom AST-based query builder designed for maximum type safety and performance.
- **Validation Integrated**: One schema definition generates DB types, validation schemas, and security policies.
- **Policy Push-down**: Automatically filters unauthorized columns and rows at the SQL generation level.
- **PII & Redaction**: Built-in support for masking sensitive data (e.g., email masking, hidden fields) driven by `@pureq/validation` policies.
- **Edge Ready**: Native support for Cloudflare D1, Neon HTTP, and PlanetScale.
- **Observability**: Built-in query diagnostics and tracing support.
- **Resilient**: Automatic retries for transient database errors.
- **Zero-Config Migrations**: Simple transaction-safe migration manager with rollback and preview support.

## Installation

```bash
npm install @pureq/db @pureq/validation
```

## Quick Start

### 1. Define your Schema

```typescript
import { table, column } from "@pureq/db";

export const users = table("users", {
  id: column.uuid().primary(),
  name: column.string(),
  email: column.string().policy({ pii: true, redact: "mask" }),
  role: column.enum(["admin", "user"]).default("user"),
  salary: column.number().policy({ scope: ["admin"], redact: "hide" }),
});
```

### 2. Connect and Query

```typescript
import { DB, PostgresDriver, withRetry } from "@pureq/db";
import { users } from "./schema.js";

const db = new DB(new PostgresDriver(client));

// Query with automatic masking and scope-based filtering
const results = await db.select()
  .from(users)
  .withContext({ userId: "current-user-id", scopes: ["user"] })
  .execute();

// results[0].email -> "shi***" (masked)
// results[0].salary -> undefined (hidden)
```

## Advanced Usage

### Joins & Aggregations

```typescript
import { count, sum } from "@pureq/db";

const stats = await db.select([
    "role",
    count("*"),
    sum("salary")
  ])
  .from(users)
  .groupBy("role")
  .execute();
```

### Error Handling

Standardized error classes across all drivers:

```typescript
try {
  await db.insert(users).values(data).execute();
} catch (e) {
  if (e instanceof UniqueViolationError) {
    // Handle duplicate email
  }
}
```

### Edge Adapters

```typescript
import { D1Driver, DB } from "@pureq/db";

// In Cloudflare Workers
export default {
  async fetch(request, env) {
    const db = new DB(new D1Driver(env.DB));
    // ...
  }
}
```

## CLI

```bash
# Validate your schemas for policy coverage (PII/Redaction checks)
npx pureq-db validate "**/*.schema.ts"

# Run database seeding
npx pureq-db seed
```

## License

MIT
