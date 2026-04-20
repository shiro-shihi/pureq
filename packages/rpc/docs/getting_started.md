# Getting Started with Pureq RPC

This guide will walk you through setting up a 100% secure, type-safe binary data bridge in 5 minutes.

## 1. Define your Manifest

Create a file (e.g., `shared/rpc.ts`) to define your pre-authorized queries. This file is shared between server and client.

```typescript
import { defineManifest } from "@pureq/rpc";
import { db, users } from "./db-schema"; // Your @pureq/db setup

export const rpcManifest = defineManifest({
  // This query is now frozen and authorized
  getUser: db.select('id', 'name', 'email')
             .from(users)
             .where(u => u.id.eq(p(0))),
             
  listActivePosts: db.select('title', 'content')
                     .from(posts)
                     .where(p => p.status.eq('ACTIVE'))
});

export type AppRouter = typeof rpcManifest;
```

## 2. Setup the Server Handler

In your Edge Function or Node.js server (Cloudflare Workers example):

```typescript
import { FortressRouter, RpcHandler } from "@pureq/rpc";
import { rpcManifest } from "./shared/rpc";

const router = new FortressRouter(rpcManifest);

// Map the manifest QueryId to actual execution logic
router.procedure("getUser", async ({ input, ctx }) => {
  return await db.execute(rpcManifest.getUser, [input.id]);
});

const handler = new RpcHandler(router);

export default {
  async fetch(request, env) {
    return handler.handleRequest(request, async () => ({
      sessionSecret: env.SESSION_SECRET, // Used for HMAC signature verification
      userId: "user_123"
    }));
  }
};
```

## 3. Use the Client

In your frontend application:

```typescript
import { createPureqClient } from "@pureq/rpc";
import type { AppRouter } from "./shared/rpc";

const client = createPureqClient<AppRouter>({
  url: "https://your-api.com/rpc",
  getSessionSecret: () => localStorage.getItem("pureq_session_secret")
});

// 100% type-safe and AEAD-integrity protected
const user = await client.getUser({ id: 1 });
console.log(user.name); 
```

## Next Steps

- Learn how [Physical Masking](./physical_masking.md) prevents data leaks.
- Deep dive into [Identity-Bound Signatures](./security_hmac_signatures.md).
