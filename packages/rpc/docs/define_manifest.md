# Defining Manifests: The Security Lockdown

The `defineManifest` function is the most important security control in the Pureq RPC ecosystem. It is the "Sealed Door" that prevents unauthorized code from ever reaching your database.

## The Static-Only Mandate

Pureq RPC **forbids** any runtime generation of SQL structures. 
- You cannot pass dynamic arrays of column names to `.select()`.
- You cannot pass dynamic table names to `.from()`.
- You cannot build queries using arbitrary string concatenation.

### Why this restriction?
By forcing queries to be statically resolvable at compile-time, we can pre-calculate the **QueryId** and the **Physical Masking Map**. At runtime, the server only understands these pre-defined structures.

### Rejection of Dynamic Queries

```typescript
// ❌ THIS WILL FAIL at the type level
const cols = ['id', 'name'];
export const manifest = defineManifest({
  getUsers: db.select(cols).from(users) // Error: Type 'string[]' is not assignable to literal...
});

// ✅ REWRITE using static branches
export const manifest = defineManifest({
  getUsersCompact: db.select('id').from(users),
  getUsersFull: db.select('id', 'name').from(users)
});
```

## Runtime Metadata Preservation

While TypeScript types are erased at runtime, `defineManifest` preserves the **Projection Metadata**. 

When you define:
```typescript
getUser: db.select('id', 'name').from(users)
```

The manifest object at runtime physically contains:
```javascript
{
  getUser: {
    sql: "...",
    projection: new Set(['id', 'name']), // This powers Physical Masking
    ...
  }
}
```

This metadata is used by the **Binary Transcoder** to ensure that even if the DB returns a `password_hash` column, it is physically discarded before the bytes leave your server.

## Best Practices
1. **Shared Location:** Keep your manifest in a `shared/` directory accessible by both backend and frontend.
2. **Granular Queries:** Prefer specific queries over generic ones. Instead of `getUser`, have `getPublicUserProfile` and `getInternalUserDetail`.
3. **Identity Binding:** Always use manifest queries in conjunction with session context for proper Authorization.
