# Schema DSL

The Schema DSL allows you to define your database structure in a way that TypeScript can fully understand.

## Table Definition

Use the `table` function to define a new table. The first argument is the table name in the database, and the second is an object mapping column names to column definitions.

```typescript
import { table, column } from "@pureq/db";

const posts = table("posts", {
  id: column.uuid().primary(),
  title: column.string(),
  content: column.string().nullable(),
  authorId: column.number(),
});
```

## Column Types

- `column.string()`: Maps to `TEXT` or `VARCHAR`.
- `column.number()`: Maps to `INTEGER`, `SERIAL`, or `FLOAT`.
- `column.boolean()`: Maps to `BOOLEAN`.
- `column.uuid()`: Maps to `UUID` or `TEXT`.
- `column.date()`: Maps to `TIMESTAMP` or `DATE`.
- `column.json()`: Maps to `JSON` or `JSONB`.

## Column Modifiers

- `.primary()`: Designates the column as part of the Primary Key.
- `.nullable()`: Allows the column to store `null` values.
- `.default(value)`: Specifies a default value for the column.
- `.policy(policy)`: Attaches security and validation metadata.

## Policy Configuration

The `.policy()` method is where you integrate with `@pureq/validation`:

```typescript
column.string().policy({
  pii: true,               // Marks data as Personally Identifiable Information
  redact: "mask",          // Automatically masks data in certain contexts
  scope: ["admin:read"],   // Restricts access to specific auth scopes
})
```
