# Getting Started with `@pureq/db`

This guide will help you set up `@pureq/db` and perform your first type-safe, validation-integrated database operations.

## 1. Installation

Install the package and its peer dependencies (e.g., `@pureq/validation`):

```bash
pnpm add @pureq/db @pureq/validation
```

## 2. Define Your Schema

Define your database schema using the Schema DSL. This serves as the single source of truth for your database types and validation rules.

```typescript
// schema.ts
import { table, column } from "@pureq/db";

export const users = table("users", {
  id: column.number().primary(),
  name: column.string(),
  email: column.string().policy({ pii: true }),
  age: column.number().nullable(),
  createdAt: column.date().default(new Date()),
});
```

## 3. Initialize the DB Client

Initialize the `DB` class with a driver. Drivers are available for PostgreSQL (`PostgresDriver`) and SQLite (`BetterSqlite3Driver`).

```typescript
import { DB, PostgresDriver } from "@pureq/db";
import { Client } from "pg";

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});
await client.connect();

export const db = new DB(new PostgresDriver(client));
```

## 4. Basic CRUD Operations

### Insert Data

```typescript
await db.insert(users).values({
  name: "John Doe",
  email: "john@example.com",
  age: 30,
}).execute();
```

### Select Data with Validation

By calling `.validate()`, `@pureq/db` will automatically parse and validate the database result against the schema, ensuring type safety even for data coming from the database.

```typescript
const activeUsers = await db
  .select()
  .from(users)
  .where("age", ">", 18)
  .validate()
  .execute();
```

### Update and Delete

```typescript
await db.update(users)
  .set({ age: 31 })
  .where("name", "=", "John Doe")
  .execute();

await db.delete(users)
  .where("id", "=", 1)
  .execute();
```

## 5. Using the Validation Bridge

The schema defined for the database can be instantly converted into a `@pureq/validation` schema.

```typescript
import { toValidationSchema } from "@pureq/db";
import { users } from "./schema";

const userValidationSchema = toValidationSchema(users);

// Now you can use it for input validation in your API
const result = userValidationSchema.parse(inputData);
```
