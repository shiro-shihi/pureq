# Query Builder

The `@pureq/db` Query Builder provides a fluent, type-safe API for interacting with your data.

## SELECT

Fetch records from a table.

```typescript
const users = await db.select()
  .from(usersTable)
  .where("age", ">", 21)
  .orderBy("name", "ASC")
  .limit(10)
  .execute();
```

### Advanced Selection

You can select specific columns by passing an array to `.select()`:

```typescript
const names = await db.select(["name"])
  .from(usersTable)
  .execute();
```

## INSERT

Add new records. The `values` method is strictly typed based on your schema.

```typescript
await db.insert(usersTable)
  .values({
    name: "Jane Smith",
    email: "jane@example.com"
  })
  .execute();
```

## UPDATE

Modify existing records.

```typescript
await db.update(usersTable)
  .set({ age: 25 })
  .where("email", "=", "jane@example.com")
  .execute();
```

## DELETE

Remove records.

```typescript
await db.delete(usersTable)
  .where("id", "=", 123)
  .execute();
```

## Validation Integration

By chaining `.validate()`, you ensure that every row returned by the database satisfies your schema constraints. If the database contains corrupted or unexpected data, an error will be thrown before the data reaches your application logic.

```typescript
const safeData = await db.select()
  .from(usersTable)
  .validate()
  .execute();
```
