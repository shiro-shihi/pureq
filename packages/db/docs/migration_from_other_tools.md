# Migration from Other Tools

If you are coming from Prisma, Kysely, or plain SQL, here is how you can map your knowledge to `@pureq/db`.

## From Prisma

Prisma uses a specialized `.prisma` file. In `@pureq/db`, you define your schema in pure TypeScript.

**Prisma:**

```prisma
model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
}
```

**@pureq/db:**

```typescript
const users = table("User", {
  id: column.number().primary(),
  email: column.string(),
});
```

**Querying:**

- Prisma: `prisma.user.findMany({ where: { age: { gt: 18 } } })`
- @pureq/db: `db.select().from(users).where("age", ">", 18).execute()`

## From Kysely

`@pureq/db` shares a similar fluent API style with Kysely but adds integrated validation and policy support.

**Kysely:**

```typescript
db.selectFrom('person').selectAll().where('id', '=', 1).execute()
```

**@pureq/db:**

```typescript
db.select().from(person).where('id', '=', 1).execute()
```

## Why Migrate?

1. **Zero-overhead Validation**: No need to manually sync Zod schemas with your DB types.
2. **Policy-Driven Security**: Define PII and access rules once in the schema.
3. **Edge-Ready**: Native support for HTTP-based drivers (Neon, D1) without extra plugins.
