# Implementation Examples

This document provides concrete examples of how to use `@pureq/db` for common application patterns.

## 1. User Authentication & Profile

A typical setup for handling user accounts and their associated profiles.

```typescript
import { table, column, DB } from "@pureq/db";

// 1. Define Tables
export const users = table("users", {
  id: column.uuid().primary(),
  email: column.string().policy({ pii: true }),
  passwordHash: column.string().policy({ redact: "hide" }),
});

export const profiles = table("profiles", {
  userId: column.uuid().primary(),
  displayName: column.string(),
  avatarUrl: column.string().nullable(),
});

// 2. Query with JOIN
export async function getUserWithProfile(db: DB, userId: string) {
  return await db.select()
    .from(users)
    .innerJoin("profile", profiles, ({ base, joined }) => ({
      type: "binary",
      left: { type: "column", name: "id", table: base.name },
      operator: "=",
      right: { type: "column", name: "userId", table: joined.name }
    }))
    .where("id", "=", userId)
    .validate()
    .execute();
}
```

## 2. Blog Engine with Soft Deletes

Implementing a blog system where posts are marked as deleted rather than removed.

```typescript
export const posts = table("posts", {
  id: column.number().primary(),
  title: column.string(),
  content: column.json(),
  isDeleted: column.boolean().default(false),
});

export async function getActivePosts(db: DB) {
  return await db.select()
    .from(posts)
    .where("isDeleted", "=", false)
    .orderBy("id", "DESC")
    .execute();
}
```
