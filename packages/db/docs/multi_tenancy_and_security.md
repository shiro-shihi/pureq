# Multi-Tenancy and Security

How to implement secure multi-tenant data access using Policy Push-down.

## The Problem

In a multi-tenant app (SaaS), you must ensure that User A cannot see User B's data. Adding `WHERE tenantId = ?` to every query is error-prone.

## The @pureq/db Solution: Automated RLS

By using `QueryContext`, `@pureq/db` can automatically inject the `userId` or `tenantId` into every query.

### 1. Schema with Ownership

```typescript
const documents = table("documents", {
  id: column.uuid().primary(),
  title: column.string(),
  userId: column.number(), // This column triggers auto-filtering
});
```

### 2. Secure Querying

```typescript
const userSession = { userId: 123, scopes: ["user"] };

// This query is automatically secured!
const myDocs = await db.select()
  .from(documents)
  .withContext(userSession) // userId is pushed down to SQL
  .execute();

// SQL generated: 
// SELECT id, title, userId FROM documents WHERE userId = 123
```

### 3. Column-Level Restrictions

Hide sensitive columns based on scopes.

```typescript
const users = table("users", {
  id: column.number().primary(),
  publicName: column.string(),
  internalNotes: column.string().policy({ scope: ["admin"] }),
});

// A regular user context
const results = await db.select().from(users).withContext({ scopes: ["user"] }).execute();

// Result only contains 'id' and 'publicName'. 'internalNotes' is filtered out.
```
