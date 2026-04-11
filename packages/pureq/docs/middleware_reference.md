# Middleware Reference

Middleware provides the reliability and behavior of your transport layer. This document describes all built-in middleware available in **pureq**.

## Standard Middleware Order

For a production-ready stack, we recommend the following order:

1. `dedupe` (Short-circuit duplicate in-flight requests)
2. `httpCache` (Return cached data early)
3. `retry` (Retry on failure)
4. `circuitBreaker` (Stop requests if the service is down)
5. `validation` (Ensure the response matches your schema)

---

## 1. retry

Automatically retries failed idempotent requests.

```ts
import { retry } from "@pureq/pureq";

api.use(retry({
  maxRetries: 3,
  delay: 200,
  backoff: true,
  methods: ["GET", "PUT", "DELETE", "HEAD"],
  onRetry: ({ attempt, error }) => console.warn(`Retry ${attempt}`),
}));
```

### Options

- `maxRetries`: (number) Total number of retry attempts.
- `delay`: (number) Initial delay in ms.
- `backoff`: (boolean) Uses exponential backoff if true.
- `methods`: (string[]) HTTP methods to retry (defaults to idempotent methods).
- `retryOnStatus`: (number[]) Array of HTTP status codes that trigger a retry (e.g., `[429, 503]`).

---

## 2. circuitBreaker

Prevents overloading a struggling service by "tripping" and failing fast.

```ts
import { circuitBreaker } from "@pureq/pureq";

api.use(circuitBreaker({
  failureThreshold: 5,
  cooldownMs: 30_000,
}));
```

### Circuit Breaker Options

- `failureThreshold`: (number) Number of consecutive failures before opening the circuit.
- `cooldownMs`: (number) Time in ms to wait before attempting to "half-open" the circuit.
- `successThreshold`: (number) Number of successes required in "half-open" state to close the circuit.

---

## 3. dedupe

Collapses multiple concurrent, identical GET requests into a single network call.

```ts
import { dedupe } from "@pureq/pureq";

api.use(dedupe({
  methods: ["GET", "HEAD"],
}));
```

---

## 4. httpCache

An in-memory LRU cache that respects `ETag` and supports stale-while-error.

```ts
import { httpCache } from "@pureq/pureq";

api.use(httpCache({
  ttlMs: 10_000,
  maxEntries: 100,
  staleIfErrorMs: 60_000,
}));
```

### HTTP Cache Options

- `ttlMs`: (number) Time-to-live for cache entries.
- `maxEntries`: (number) Maximum number of entries in the LRU cache.
- `staleIfErrorMs`: (number) Serve stale data if the subsequent network request fails within this window.

---

## 5. offlineQueue

Queues mutation requests while offline and replays them when connectivity is restored.

```ts
import { createOfflineQueue } from "@pureq/pureq";

const queue = createOfflineQueue({
  storage: new IndexedDBQueueStorageAdapter(),
  methods: ["POST", "PUT", "PATCH"],
});

api.use(queue.middleware);
```

### Note

Requires a storage adapter (`IndexedDBQueueStorageAdapter` for browsers or `FileSystemQueueStorageAdapter` for Node.js).

---

## 6. authRefresh

Handles 401 Unauthorized errors by refreshing the token once (preventing thundering herds) and retrying the request.

```ts
import { authRefresh } from "@pureq/pureq";

api.use(authRefresh({
  refresh: async () => {
    const res = await fetch("/api/refresh", { method: "POST" });
    return (await res.json()).token;
  },
}));
```

---

## 7. validation

Bridge to any schema library (Zod, Valibot, etc.).

```ts
import { validation } from "@pureq/pureq";
import { z } from "zod";

const UserSchema = z.object({ id: z.string() });

api.use(validation({
  validate: (data) => UserSchema.parse(data),
}));
```

---

## 8. Presets

If you don't want to configure each middleware individually, use our production presets:

- `frontendPreset()`: Balanced for web apps (retry 1, dedupe, 5s timeout).
- `bffPreset()`: Optimized for microservice communication.
- `backendPreset()`: Aggressive retries and circuit breakers for internal services.

```ts
import { createClient, frontendPreset } from "@pureq/pureq";

const api = createClient({
  baseURL: "/api",
  middlewares: frontendPreset(),
});
```
