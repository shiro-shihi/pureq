# Core Concepts

This document explores the architectural philosophy of **pureq** and explains why it differs from traditional HTTP clients like Axios or the native `fetch` API.

## 1. Immutable Client Composition

In `pureq`, clients are **immutable snapshots**. Every time you add a middleware or an interceptor, you get a brand new client instance. The original client remains unchanged.

### Why Immutability?

Traditional clients often use a single global instance. If you need to add a specialized header or a retry policy for one specific part of your app, you risk accidentally leaking that configuration to other parts of the system.

Immutable clients enable **safe branching**:

```ts
import { createClient, retry, dedupe } from "@pureq/pureq";

const base = createClient({ baseURL: "https://api.example.com" });

// Branch A: Robust with retries
const robustApi = base.use(retry({ maxRetries: 3 }));

// Branch B: Fast and deduplicated
const publicApi = base.use(dedupe());

// Branch C: Authed (inherits nothing from A or B)
const authedApi = base.useRequestInterceptor((req) => ({
  ...req,
  headers: { ...req.headers, Authorization: "Bearer ..." },
}));
```

## 2. The Onion Model (Middleware)

`pureq` uses an **Onion Model** for middleware, similar to Koa or Redux. Each middleware "wraps" the execution of the request.

```text
Request (Incoming)
  ├─ [Middleware A: Start]
  │   ├─ [Middleware B: Start]
  │   │   └─ [The actual HTTP fetch]
  │   └─ [Middleware B: End]
  └─ [Middleware A: End]
Response (Outgoing)
```

### Order Matters

Because middleware wraps each other, the order in which you `.use()` them determines their behavior.

- **`retry` outside `circuitBreaker`**: If the request fails, it retries. Each individual retry attempt will be checked against the circuit breaker's status.
- **`circuitBreaker` outside `retry`**: The circuit breaker sees the "whole" operation. If the operation fails after all retries, only then does it count as a failure for the breaker.

## 3. Middleware vs. Interceptors

`pureq` distinguishes between these two for clarity:

- **Middleware**: Handles **Async Control Flow**. It can pause the request (auth refresh), retry it (retry), prevent it (circuit breaker), or return a cached value (httpCache). Middleware uses a `next()` function to pass control to the next layer.
- **Interceptors**: Handle **Data Transformation**. They are lightweight hooks used to modify the request just before it's sent or the response just after it's received. They cannot stop or retry the request.

## 4. Type-Safe Path Parameters

`pureq` uses TypeScript Template Literal Types to parse path parameters from URL strings at compile time.

```ts
// TypeScript knows that this URL requires 'userId' and 'postId'
client.getJson("/users/:userId/posts/:postId", {
  params: {
    userId: "123",
    postId: "456",
  },
});
```

If you forget a parameter or misspell it, TypeScript will throw a compilation error. This eliminates a whole class of runtime bugs without requiring a heavy Schema library.
