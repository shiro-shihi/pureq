# @pureq/db v1.0.0

**The Policy-First, Edge-Native Database Engine for TypeScript.**

@pureq/db is a zero-trust database access layer designed for the modern web. Built from the ground up for Edge runtimes (Cloudflare Workers, Vercel Edge, Deno, Bun) and Node.js, it deeply integrates with @pureq/validation to ensure that data access, validation, and row-level security (RLS) are defined once and enforced everywhere.

With the release of v1.0.0, we introduce a hardcore security architecture and an ergonomic ORM-like relation engine, giving you the raw performance of a query builder with the developer experience of a modern ORM.

---

## Why @pureq/db?

In a landscape dominated by Prisma, Drizzle, and Kysely, @pureq/db takes a radically different approach: **Security by Schema**. We believe that security policies (who can see what row, which columns contain PII, what data must be masked) belong in the database schema, not scattered across your application logic.

### The Competition at a Glance

| Feature | @pureq/db | Prisma | Drizzle | Kysely |
| :--- | :--- | :--- | :--- | :--- |
| **Philosophy** | **Policy-First / Zero-Trust** | Developer Experience | Performance / SQL-like | Type-Safety / SQL-like |
| **Row-Level Security (RLS)** | **Native (AST Push-down)** | Application logic | Application logic | Application logic |
| **Column-Level Security (CLS)** | **Native (Masking / Redaction)** | Prisma Client Extensions | Application logic | Application logic |
| **Relation Eager Loading** | **Yes (.with())** | Yes (include) | Yes (with) | Manual JOINs |
| **Edge Readiness** | **Native (0 dependencies)** | Needs Data Proxy | Excellent | Excellent |
| **Validation Integration** | **Native (@pureq/validation)** | Zod/Yup generators | Zod/TypeBox generators | Zod/Valibot generators |
| **Performance** | **High (Direct SQL execution)** | Medium (Rust Engine overhead) | High | High |
| **Security Hardening** | **Extreme (NFKC, Circular DoS checks)** | Standard | Standard | Standard |

---

## Key Features

### 1. Hardcore Security Architecture (v1.0.0)

We treat the database layer as the ultimate defense mechanism.

- **Unicode Homograph Defense**: Built-in NFKC normalization checks to prevent bypass attacks via visually identical characters.
- **AST-Level DoS Protection**: Prevents circular reference crashes and massive OR-chain memory exhaustion.
- **Strict Parameter Bounds**: Automatically protects against database-engine-specific limits (e.g., PostgreSQL's 65k parameter limit).
- **Safe JSON Querying**: Safely query JSONB fields using the .at() method without exposing the underlying database operators to injection risks.

### 2. Universal Row-Level Security (RLS) & Column-Level Security (CLS)

Define security policies directly on your tables and columns using a clean, expressive API. When you pass a QueryContext, @pureq/db automatically rewrites the AST to enforce these rules before the SQL is ever generated.

```typescript
import { table, column } from "@pureq/db";

export const organizations = table("organizations", {
  id: column.number().primary(),
  name: column.string(),
  revenue: column.number().policy({ scope: ["admin:billing"], redact: "hide" }),
}, {
  policy: {
    // RLS: Users can only query data within their own organization
    // Helpers (eq, col, etc.) are automatically injected for clean DX
    rls: (ctx, { eq, col }) => eq(col("id"), ctx.orgId)
  }
});
```

### 3. Ergonomic Relations & Eager Loading

Get ORM-like nested objects without sacrificing query builder performance. Define relations and use .with() to automatically resolve JOINs and structure the result set.

```typescript
// Define relations in the schema
export const posts = table("posts", {
  id: column.number().primary(),
  title: column.string(),
  authorId: column.number().references(users, "id"),
}, {
  relations: {
    author: belongsTo(users, "authorId")
  }
});

// Query and automatically nest the result!
const results = await db.select()
  .from(posts)
  .with("author") // Eagerly loads and structures the author
  .execute();

/* Result:
[
  {
    id: 1,
    title: "Hello World",
    authorId: 10,
    author: { id: 10, name: "Alice" } // Automatically nested!
  }
]
*/
```

### 4. Safe JSONB Querying

Query inside JSON columns seamlessly without risking operator injection.

```typescript
const posts = table("posts", {
  // ...
  metadata: column.json(),
});

await db.select()
  .from(posts)
  // Safely compiles to appropriate dialect (e.g., "metadata" ->> 'tags.category')
  .where(posts.columns.metadata.at("tags.category"), "=", "tech")
  .execute();
```

---

## Installation

```bash
npm install @pureq/db @pureq/validation
```

## Quick Start

### Connecting (Edge & Node.js)

@pureq/db supports any runtime with zero external dependencies.

```typescript
import { DB, PostgresDriver, D1Driver, BetterSQLite3Driver } from "@pureq/db";

// 1. PostgreSQL (Node.js, Neon, Vercel)
const db = new DB(new PostgresDriver(client));

// 2. Cloudflare D1 (Workers)
const db = new DB(new D1Driver(env.DB));

// 3. SQLite (Node.js / Bun)
const db = new DB(new BetterSQLite3Driver(sqliteClient));
```

### Querying with Context

Always pass the user's context to ensure RLS and CLS are automatically applied.

```typescript
const userContext = { 
  userId: "usr_123", 
  orgId: 999, 
  scopes: ["user:read"] 
};

const data = await db.select()
  .from(organizations)
  .withContext(userContext) // Policy push-down happens here
  .execute();
```

---

## Validation Bridge

Because @pureq/db shares its DNA with @pureq/validation, you can enforce runtime validation guarantees on your database results. If the database returns corrupted data, it will be caught before it reaches your application logic.

```typescript
const safeData = await db.select()
  .from(users)
  .validate() // Throws if the DB data violates the schema definition
  .execute();
```

## License

MIT
