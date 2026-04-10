# pureq

Functional, immutable, type-safe HTTP transport layer for TypeScript.

[Quick Start](#quick-start) · [Why pureq](#why-pureq) · [Middleware](#reliability-middleware) · [React Query](#react-query--swr-integration) · [BFF / Backend](#bff--backend-patterns) · [API Reference](#api-reference)

---

**pureq** is not another fetch wrapper. It's a **policy-first transport layer** that makes HTTP behavior explicit, composable, and observable — across frontend, BFF, backend, and edge runtimes.

```ts
import { createClient, retry, circuitBreaker, dedupe } from "pureq";

const api = createClient({ baseURL: "https://api.example.com" })
  .use(dedupe())
  .use(retry({ maxRetries: 2, delay: 200 }))
  .use(circuitBreaker({ failureThreshold: 5, cooldownMs: 30_000 }));

const user = await api.getJson<User>("/users/:id", { params: { id: "42" } });
```

Zero runtime dependencies. Works everywhere `fetch` works.

## Install

```bash
npm install @pureq/pureq
```

### Node.js (with FileSystem support)

If using Node.js specific adapters (like `FileSystemQueueStorageAdapter`), use the node subpath:

```ts
import { FileSystemQueueStorageAdapter } from "pureq/node";
```

> [!NOTE]
> Using this subpath ensures that Node.js native modules (like `fs` or `path`) are not accidentally bundled into your frontend builds (Webpack/Vite/Esbuild), preventing build-time errors and keeping bundle sizes small.

## Quick Start

### The simplest case

```ts
import { createClient } from "pureq";

const client = createClient();

const response = await client.get("https://api.example.com/health");
console.log(response.status); // 200
```

### Typed path parameters

```ts
// TypeScript ensures you provide { id: string } for :id
const response = await client.get("/users/:id", {
  params: { id: "42" },
});

const user = await response.json<{ id: string; name: string }>();
```

### JSON helpers (one-liner)

```ts
// GET + status check + JSON parse in one step
const user = await client.getJson<User>("/users/:id", {
  params: { id: "42" },
});
```

### Non-throwing Result API

```ts
const result = await client.getResult("/users/:id", {
  params: { id: "42" },
});

if (!result.ok) {
  // kind: human-friendly, code: machine-friendly (same error concept in two formats)
  console.error(result.error.kind, result.error.code, result.error.message);
  return;
}

const response = result.data; // HttpResponse
```

Every request method has a `*Result` variant that never throws — transport failures become values you can pattern-match on.

### Systematic Error Codes

For enterprise-grade observability, `PureqError` exposes both `kind` and `code` on the same error object. They represent the same category in two formats:

- `kind`: human-friendly lowercase string (e.g. `"timeout"`)
- `code`: machine-readable Screaming Snake Case (e.g. `"PUREQ_TIMEOUT"`)

```ts
if (!result.ok) {
  if (result.error.kind === "timeout" && result.error.code === "PUREQ_TIMEOUT") {
    // Handle specifically...
  }
}
```

Common codes: `PUREQ_TIMEOUT`, `PUREQ_NETWORK_ERROR`, `PUREQ_OFFLINE_QUEUE_FULL`, `PUREQ_AUTH_REFRESH_FAILED`, `PUREQ_VALIDATION_ERROR`.

---

## Why pureq

### The problem with raw `fetch`

`fetch` is a primitive. It gives you a single request/response cycle and nothing else. Every team ends up rebuilding the same things on top of it:

```ts
// This is what real-world fetch code looks like
async function fetchUser(id: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`/api/users/${id}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.status === 429) {
      // retry? how many times? what delay?
    }
    if (response.status >= 500) {
      // retry? circuit break? log?
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (err) {
    clearTimeout(timeout);
    // is it a timeout? network error? abort? how do we tell?
    throw err;
  }
}
```

Every endpoint handler re-decides retry, timeout, error shape, and observability. There's no consistency, no composition, and no governance.

**pureq replaces that with:**

```ts
const api = createClient({ baseURL: "/api" })
  .use(retry({ maxRetries: 2, delay: 200, retryOnStatus: [429, 500, 502, 503] }))
  .use(circuitBreaker({ failureThreshold: 5, cooldownMs: 30_000 }));

const user = await api.getJson<User>("/users/:id", {
  params: { id },
  timeout: 5000,
});
```

Policy is declared once, applied everywhere, and enforced by the type system.

### How pureq compares to axios

axios is familiar and battle-tested. But its mutability model makes transport behavior hard to reason about at scale:

| Concern | **axios** | **pureq** |
| --- | --- | --- |
| Client model | Mutable instances | Immutable — `.use()` returns new client |
| Retry/Circuit breaker | External packages (axios-retry, etc.) | Built-in middleware |
| Error model | Throws by default, boolean flags | `Result<T, E>` pattern — no exceptions |
| Path params | String interpolation | Type-safe `:param` templates |
| Middleware model | Interceptors (mutate config) | Onion middleware (compose behavior) |
| Policy guardrails | None | Validates invalid combinations at startup |
| Observability | Interceptor-based logging | Structured event hooks + OTel export |
| Bundle | ~14 KB gzipped + adapters | Zero-dependency, tree-shakeable |

pureq isn't "better" than axios universally. But if you want **explicit transport policy** that doesn't drift across a growing codebase, pureq is designed for that.

### pureq vs React Query / SWR

pureq does **not** replace React Query or SWR. They solve different problems:

| Concern | **React Query / SWR** | **pureq** |
| --- | --- | --- |
| Cache lifecycle | ✅ stale-while-revalidate, GC, refetch | ❌ not a UI cache |
| Query keys | ✅ declarative caching | ❌ |
| Suspense integration | ✅ | ❌ |
| UI state (loading/error) | ✅ | ❌ |
| Retry + backoff | ⚠️ basic | ✅ full control |
| Circuit breaker | ❌ | ✅ |
| Deadline propagation | ❌ | ✅ |
| Request dedup | ⚠️ by query key | ✅ by request signature |
| Concurrency limits | ❌ | ✅ |
| Hedged requests | ❌ | ✅ |
| Offline queue | ❌ | ✅ |
| Request observability | ❌ | ✅ OTel-ready |
| Idempotency keys | ❌ | ✅ |
| Multi-runtime | ⚠️ React-only | ✅ Any JS runtime |

**They compose perfectly together** — pureq is the transport layer *underneath* React Query:

```ts
import { useQuery } from "@tanstack/react-query";
import { createClient, retry, circuitBreaker } from "pureq";

const api = createClient({ baseURL: "https://api.example.com" })
  .use(retry({ maxRetries: 2, delay: 200 }))
  .use(circuitBreaker({ failureThreshold: 5, cooldownMs: 30_000 }));

function useUser(id: string) {
  return useQuery({
    queryKey: ["user", id],
    queryFn: () => api.getJson<User>("/users/:id", { params: { id } }),
  });
}
```

React Query handles: cache lifecycle, stale-while-revalidate, refetching, and suspense.
pureq handles: retry strategy, circuit breaking, timeouts, dedup, and telemetry.

Clean separation. No overlap.

---

## Core Concepts

### Immutable client composition

Every call to `.use()`, `.useRequestInterceptor()`, or `.useResponseInterceptor()` returns a **new** client instance. The original is never mutated.

```ts
const base = createClient({ baseURL: "https://api.example.com" });
const withRetry = base.use(retry({ maxRetries: 2, delay: 200 }));
const withAuth = withRetry.useRequestInterceptor((req) => ({
  ...req,
  headers: { ...req.headers, Authorization: `Bearer ${getToken()}` },
}));

// base, withRetry, and withAuth are three separate clients
```

This makes it trivial to share a base client while customizing per-dependency behavior.

### Middleware: the Onion Model

Middleware wraps the entire request lifecycle. Each middleware can intercept the request before it happens, await the result, and post-process the response:

```text
Request → [dedupe] → [retry] → [circuitBreaker] → fetch() → Response
                                                       ↑
                                              the "onion" unwinds
```

Middleware can:

- Transform the request before `next()`
- Decide whether to call `next()` at all (e.g., cache hit, circuit open)
- Retry `next()` on failure (e.g., retry middleware)
- Transform the response after `next()`

### Interceptors vs Middleware

pureq distinctly separates lifecycle control from simple data transformation:

- **Middleware (Onion Model)**: Used for async control flow. Middleware wrappers can pause, retry, hedge, or completely short-circuit the network request (e.g., caching). They govern the *lifetime* and state of the request.
- **Interceptors**: Used for pure data transformation. `useRequestInterceptor` and `useResponseInterceptor` are lightweight hooks to modify the shape of the request or response (e.g., synchronously adding a token header) without the boilerplate of managing async state or the `next()` function cascade.

### Type-safe path parameters

Route templates like `/users/:userId/posts/:postId` are type-checked at compile time:

```ts
// ✅ Compiles — params match the URL template
await client.get("/users/:userId/posts/:postId", {
  params: { userId: "1", postId: "42" },
});

// ❌ TypeScript error — missing 'postId'
await client.get("/users/:userId/posts/:postId", {
  params: { userId: "1" },
});
```

### Result-based error handling

Instead of `try/catch` everywhere, use the `*Result` variants for explicit error handling:

```ts
const result = await client.postResult("/orders", orderData);

if (!result.ok) {
  switch (result.error.kind) {
    case "network":
      showOfflineNotice();
      break;
    case "timeout":
      showRetryPrompt();
      break;
    case "circuit-open":
      showDegradedMode();
      break;
    default:
      logError(result.error);
  }
  return;
}

// result.data is HttpResponse
const order = await result.data.json<Order>();
```

### Streams and Binary Data

When reading payloads via `.arrayBuffer()`, `.blob()`, or `response.body` (`ReadableStream`), standard `fetch` semantics dictate that the initial Promise resolves as soon as HTTP headers are received.

pureq inherently protects the *entire stream lifecycle*. Middleware policies like `deadline()` or `defaultTimeout()` bind an `AbortSignal` to the underlying `fetch`. If a timeout is exceeded while actively downloading the body stream off the network, the signal propagates down and automatically aborts the stream, preventing memory and resource leaks safely.

---

## Reliability Middleware

All middleware is composable. Stack them in the order you want:

```ts
const client = createClient({ baseURL: "https://api.example.com" })
  .use(dedupe())                                         // collapse duplicate in-flight GETs
  .use(httpCache({ ttlMs: 10_000, maxEntries: 200 }))    // in-memory cache with LRU eviction
  .use(retry({ maxRetries: 3, delay: 200, backoff: true })) // exponential backoff
  .use(circuitBreaker({ failureThreshold: 5, cooldownMs: 30_000 }))
  .use(validation({ validate: (data) => !!data }))       // zero-dependency schema validation
  .use(fallback({ value: { body: "default", status: 200 } as any })); // graceful degradation
```

### Retry

Full-featured retry with exponential backoff, Retry-After header respect, and retry budget.

```ts
import { retry } from "pureq";

client.use(retry({
  maxRetries: 3,
  delay: 200,
  methods: ["GET", "PUT", "DELETE"], // Safe defaults: idempotent methods only
  backoff: true,
  onRetry: ({ attempt, error }) => console.warn(`Retry #${attempt}`, error),
}));
```

**Safety First**: By default, `retry` only targets idempotent methods. To retry `POST` or `PATCH`, you must explicitly add them to `methods` and ensure the backend supports idempotency keys.

```text
POST /api/orders HTTP/1.1
Idempotency-Key: abc-123
```

### Deadline Propagation

Enforces a total request budget across all retry attempts — different from a per-request timeout.

```ts
import { deadline, retry } from "pureq";

const client = createClient()
  .use(deadline({ defaultTimeoutMs: 1500 }))  // 1.5s total, no matter how many retries
  .use(retry({ maxRetries: 3, delay: 200 }));
```

### Circuit Breaker

Stops sending requests to a failing dependency. Automatically probes for recovery.

```ts
import { circuitBreaker } from "pureq";

client.use(circuitBreaker({
  failureThreshold: 5,   // open after 5 consecutive failures
  successThreshold: 2,   // close after 2 successes in half-open
  cooldownMs: 30_000,    // probe again after 30s
}));
```

### Concurrency Limit

Caps in-flight requests globally or by key to protect backend resources.

```ts
import { concurrencyLimit } from "pureq";

client.use(concurrencyLimit({
  maxConcurrent: 20,
  keyBuilder: (req) => new URL(req.url).hostname,
}));
```

### Hedged Requests

Issues a duplicate request after a short delay for tail-latency-sensitive reads. The first response wins; the loser is aborted.

```ts
import { hedge } from "pureq";

client.use(hedge({
  hedgeAfterMs: 80,
  methods: ["GET"],
}));
```

### Request Deduplication

Collapses concurrent duplicate GET requests into a single in-flight call.

```ts
import { dedupe } from "pureq";

client.use(dedupe({
  methods: ["GET", "HEAD"],
}));
```

### HTTP Cache

In-memory cache with ETag revalidation and stale-if-error fallback.

```ts
import { httpCache } from "pureq";

client.use(httpCache({
  ttlMs: 10_000,
  staleIfErrorMs: 60_000,
  maxEntries: 500,          // LRU eviction when full
}));
```

### Offline Queue

Queues mutation requests when offline and replays them when connectivity restores.

```ts
import { createOfflineQueue, idempotencyKey } from "pureq";

// 1. Create durable storage (IndexedDB for browser, FS for Node)
const storage = new IndexedDBQueueStorageAdapter();

// 2. (Optional) Wrap with encryption for enterprise security
// myCryptoKey can come from crypto.subtle.generateKey(...) or importKey/deriveKey from a password.
const encryptedStorage = new EncryptedQueueStorageAdapter(storage, myCryptoKey);

const queue = createOfflineQueue({
  storage: encryptedStorage,
  methods: ["POST", "PUT", "PATCH"],
  ttlMs: 24 * 60 * 60 * 1000, // 24h expiration
  lockName: "my-app-offline-lock", // Multi-tab coordination
});

const client = createClient()
  .use(idempotencyKey())
  .use(queue.middleware);

// Later, when back online:
await queue.flush((req) => client.post(req.url, req.body));
```

**Durable Adapters**:

- `IndexedDBQueueStorageAdapter`: Standard browser persistence.
- `FileSystemQueueStorageAdapter`: Node.js persistence (import from `pureq/node`).
- `EncryptedQueueStorageAdapter`: Wrapper that encrypts data at rest using AES-GCM.

```ts
// Example: Creating an encrypted storage
const encrypted = new EncryptedQueueStorageAdapter(new IndexedDBQueueStorageAdapter(), key);
```

### Idempotency Keys

Automatically injects idempotency key headers for mutation requests.

```ts
import { idempotencyKey } from "pureq";

client.use(idempotencyKey({
  headerName: "Idempotency-Key",   // default
  methods: ["POST", "PUT", "PATCH", "DELETE"],
}));
```

### Auth Refresh

Automatically handles 401 Unauthorized errors by refreshing the token and retrying the request. Includes built-in "thundering herd" prevention to ensure only one refresh request is in-flight at a time.

```ts
import { authRefresh } from "pureq";

client.use(authRefresh({
  refresh: async () => {
    const res = await fetch("/api/refresh", { method: "POST" });
    return (await res.json()).token;
  },
  // Optional: customize how the request is updated
  updateRequest: (req, token) => ({
    ...req,
    headers: { ...req.headers, Authorization: `Bearer ${token}` }
  })
}));
```

### Validation

A zero-dependency bridge to any schema validation library (Zod, Valibot, etc.) or custom type guards.

```ts
import { validation } from "pureq";
import { z } from "zod";

const UserSchema = z.object({ id: z.string(), name: z.string() });

client.use(validation({
  validate: (data) => UserSchema.parse(data), // Throws PUREQ_VALIDATION_ERROR on failure
  message: "Invalid API response schema"
}));
```

### Fallback

Enables "Graceful Degradation" by returning a default value or cached data when a request fails.

```ts
import { fallback, HttpResponse, type PureqError } from "pureq";

const isPureqError = (value: unknown): value is PureqError => {
  return typeof value === "object" && value !== null && "code" in value && "kind" in value;
};

client.use(fallback({
  value: new HttpResponse(new Response(JSON.stringify({ items: [] }), { status: 200 })),
  when: (trigger) =>
    trigger.type === "error" &&
    isPureqError(trigger.error) &&
    trigger.error.code === "PUREQ_TIMEOUT" &&
    trigger.error.kind === "timeout"
}));
```

### Policy Guardrails

pureq validates your middleware stack at client creation time and rejects invalid combinations:

```ts
// ❌ Throws: "pureq: multiple retry policies are not allowed in one client"
createClient()
  .use(retry({ maxRetries: 2, delay: 200 }))
  .use(retry({ maxRetries: 3, delay: 300 }));

// ❌ Throws: "pureq: use deadline or defaultTimeout, not both"
createClient()
  .use(deadline({ defaultTimeoutMs: 1500 }))
  .use(defaultTimeout(3000));
```

---

## Presets

For teams that want production-ready defaults without configuring each middleware:

```ts
import { createClient, frontendPreset, bffPreset, backendPreset } from "pureq";

// Frontend: conservative retries, short timeout, dedup for GETs
let frontend = createClient();
for (const mw of frontendPreset()) frontend = frontend.use(mw);

// BFF: balanced latency vs stability, idempotency for mutations
let bff = createClient();
for (const mw of bffPreset()) bff = bff.use(mw);

// Backend: aggressive retries, circuit breaker, no dedup
let backend = createClient();
for (const mw of backendPreset()) backend = backend.use(mw);
```

| Preset | Timeout | Retries | Dedup | Circuit Breaker | Idempotency |
| ------ | ------- | ------- | ----- | --------------- | ----------- |
| `frontendPreset()` | 5s | 1 | GET/HEAD | 4 failures / 10s cooldown | ✅ |
| `bffPreset()` | 3s | 2 | GET/HEAD | 5 failures / 20s cooldown | ✅ body-only |
| `backendPreset()` | 2.5s | 3 | off | 6 failures / 30s cooldown | ✅ body-only |
| `resilientPreset()` | — | 2 | All | 5 failures / 30s cooldown | ✅ |

All presets are built from the same public middleware. You can inspect and override any parameter.

---

## Observability

### Client lifecycle hooks

```ts
const client = createClient({
  hooks: {
    onRequestStart: (event) => {
      console.log(`→ ${event.method} ${event.url} [${event.requestId}]`);
    },
    onRequestSuccess: (event) => {
      console.log(`✓ ${event.status} in ${event.latencyMs}ms [retries: ${event.retryCount}]`);
    },
    onRequestError: (event) => {
      console.error(`✗ ${event.errorKind}: ${event.error.message}`);
    },
  },
});
```

### Diagnostics middleware

Collect per-request performance metrics and policy traces:

```ts
import { createMiddlewareDiagnostics, createConsoleDiagnosticsExporter } from "pureq";

const diagnostics = createMiddlewareDiagnostics({
  onEvent: createConsoleDiagnosticsExporter().export,
});

const client = createClient().use(diagnostics.middleware);

// Inspect metrics
const snap = diagnostics.snapshot();
console.log(snap.p50, snap.p95, snap.total, snap.success, snap.failed);
```

### Policy Tracing (Debuggability)

Ever wonder *why* a request was retried or why the circuit opened? `pureq` records a detailed decision trace for every request.

```ts
import { explainPolicyTrace } from "pureq";

try {
  await client.get("/flakey-endpoint");
} catch (err) {
  // Prints exactly what happened:
  // [2026-04-10T10:00:00Z] RETRY: RETRY (status=503)
  // [2026-04-10T10:00:01Z] RETRY: RETRY (status=503)
  // [2026-04-10T10:00:02Z] CIRCUIT-BREAKER: TRIP (reason="failure threshold exceeded")
  console.log(explainPolicyTrace(err.request));
}
```

### OpenTelemetry integration

Map transport events to OTel-compatible attributes:

```ts
import {
  mapToStandardHttpAttributes,
  mapToAwsSemanticConventions,
  mapToGcpSemanticConventions,
} from "pureq";

// Standard OTel HTTP semantic conventions
const attrs = mapToStandardHttpAttributes(event);
// { "http.method": "GET", "http.url": "...", "http.status_code": 200, ... }
```

### Redaction for safe telemetry

Built-in redaction profiles prevent sensitive data from leaking into logs and telemetry:

```ts
import {
  redactHeaders,
  redactObjectFields,
  redactUrlQueryParams,
  piiRedactionOptions,
  authRedactionOptions,
} from "pureq";

redactHeaders(headers);
// Authorization: "[REDACTED]", Cookie: "[REDACTED]", ...

redactUrlQueryParams("https://api.example.com/v1?token=secret123&page=1");
// "https://api.example.com/v1?token=[REDACTED]&page=1"

redactObjectFields(body, piiRedactionOptions);
// { email: "[REDACTED]", phone: "[REDACTED]", name: "Alice" }
```

---

## React Query / SWR Integration

### React Query

```ts
import { useQuery, useMutation } from "@tanstack/react-query";
import { createClient, retry } from "pureq";

const api = createClient({ baseURL: "https://api.example.com" })
  .use(retry({ maxRetries: 2, delay: 200 }));

// Queries
function useUser(id: string) {
  return useQuery({
    queryKey: ["user", id],
    queryFn: () => api.getJson<User>("/users/:id", { params: { id } }),
  });
}

// Mutations
function useCreatePost() {
  return useMutation({
    mutationFn: (data: CreatePostInput) =>
      api.postJson<Post>("/posts", data),
  });
}
```

### SWR

```ts
import useSWR from "swr";
import { createClient } from "pureq";

const api = createClient({ baseURL: "https://api.example.com" });

function useUser(id: string) {
  return useSWR(
    ["user", id],
    () => api.getJson<User>("/users/:id", { params: { id } }),
  );
}
```

**Separation of concerns:**

- **React Query / SWR** → cache lifecycle, stale-while-revalidate, background refetch, suspense, UI state
- **pureq** → retry, circuit breaking, timeout, dedup, concurrency, telemetry, error normalization

You get the best of both worlds.

---

## BFF / Backend Patterns

### BFF (Backend-For-Frontend)

A BFF aggregates multiple upstream APIs for the frontend. pureq gives you explicit per-dependency policy:

```ts
// One client per upstream service — explicit, isolated policies
const userService = createClient({ baseURL: "https://user-service.internal" })
  .use(retry({ maxRetries: 2, delay: 150 }))
  .use(circuitBreaker({ failureThreshold: 5, cooldownMs: 20_000 }))
  .useRequestInterceptor((req) => ({
    ...req,
    headers: { ...req.headers, "X-Internal-Auth": getServiceToken() },
  }));

const paymentService = createClient({ baseURL: "https://payment-service.internal" })
  .use(retry({ maxRetries: 1, delay: 500 }))
  .use(circuitBreaker({ failureThreshold: 3, cooldownMs: 60_000 }));

// BFF handler
async function handleGetUserProfile(userId: string) {
  const user = await userService.getJson<User>("/users/:id", {
    params: { id: userId },
  });

  const paymentResult = await paymentService.getResult("/payments/user/:id", {
    params: { id: userId },
  });

  return {
    ...user,
    payments: paymentResult.ok ? await paymentResult.data.json() : [],
  };
}
```

### Backend service-to-service

```ts
import { createClient, backendPreset } from "pureq";

let inventoryClient = createClient({
  baseURL: "https://inventory.internal",
  hooks: {
    onRequestError: (event) => {
      metrics.increment("inventory.request.error", { kind: event.errorKind });
    },
  },
});

for (const mw of backendPreset({
  retry: { maxRetries: 3, delay: 250 },
  circuitBreaker: { failureThreshold: 6, cooldownMs: 30_000 },
})) {
  inventoryClient = inventoryClient.use(mw);
}
```

---

## Adapters & Serializers

### Custom adapters

The default adapter uses the global `fetch`. You can swap it for tests or runtime-specific behavior:

```ts
// Test adapter
const testClient = createClient({
  adapter: async (url, init) => {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
});

// Instrumented adapter
import { createInstrumentedAdapter, fetchAdapter } from "pureq";

const instrumented = createInstrumentedAdapter(fetchAdapter, {
  onStart: (e) => console.log(`→ ${e.url}`),
  onSuccess: (e) => console.log(`✓ ${e.durationMs}ms`),
  onError: (e) => console.error(`✗ ${e.error}`),
});

const client = createClient({ adapter: instrumented });
```

### Body serializers

```ts
import { createFormUrlEncodedSerializer } from "pureq";

const client = createClient({
  bodySerializer: createFormUrlEncodedSerializer({ arrayMode: "comma" }),
});

await client.post("/search", { tags: ["ts", "http"], q: "pureq" });
// body: tags=ts%2Chttp&q=pureq
```

### Binary Protocols (MessagePack, Protobuf)

pureq was designed to be a highly extensible transport layer. To maintain a zero-dependency footprint, we do not bundle heavy binary decoders into the core. However, because pureq fully supports standard `fetch` primitives like `Uint8Array`, integrating binary protocols is natively supported today:

```ts
import { encode } from "@msgpack/msgpack";

// You can swap the body serializer to return binary formats
const msgpackSerializer = (data: unknown) => ({
  body: encode(data), // Returns Uint8Array
  headers: { "Content-Type": "application/x-msgpack" }
});

const client = createClient({ bodySerializer: msgpackSerializer });
```

**Ecosystem Vision**: Moving forward, rather than bloating the core, we plan to provide official plugin packages like `@pureq/plugin-msgpack` or `@pureq/serialize-protobuf`. This ensures the core model remains pure and lightweight while scaling to meet extreme performance requirements.

---

## Migration from fetch / axios

The smallest possible migration:

```ts
// Before (fetch)
const response = await fetch("https://api.example.com/users/42");
const user = await response.json();

// After (pureq)
import { createClient } from "pureq";
const client = createClient({ baseURL: "https://api.example.com" });
const user = await client.getJson<User>("/users/:id", { params: { id: "42" } });
```

### Step-by-step adoption

1. **Wrap one API dependency** with `createClient()` — just `baseURL` and `headers`
2. **Replace repeated `fetch` calls** with `client.get()` / `client.post()`
3. **Move retry/timeout logic** from ad-hoc `try/catch` into middleware
4. **Use `*Result` variants** where you want explicit error handling
5. **Add diagnostics** to gain observability without changing call sites
6. **Only then** add caching, hedging, circuit breaking, guardrails, or presets

Each step is independently useful. You don't need everything on day one.

More details: [Migration guide](./docs/migration_guide.md) · [Codemod recipes](./tools/codemods/README.md)

---

## Runtime Compatibility

pureq works anywhere `fetch` is available:

| Runtime | Supported | Tested |
| ------- | --------- | ------ |
| Node.js 18+ | ✅ | CI matrix (18, 20, 22) |
| Deno | ✅ | — |
| Bun | ✅ | — |
| Modern browsers | ✅ | jsdom smoke test |
| Cloudflare Workers | ✅ | Edge runtime smoke test |
| Vercel Edge | ✅ | Edge runtime smoke test |

Zero dependencies. ESM-first. Tree-shakeable.

More details: [Runtime compatibility matrix](./docs/runtime_compatibility_matrix.md)

---

## API Reference

### Client

| Method | Returns | Description |
| ------ | ------- | ----------- |
| `createClient(options?)` | `PureqClient` | Create a new immutable client |
| `client.use(middleware)` | `PureqClient` | Add middleware (returns new client) |
| `client.useRequestInterceptor(fn)` | `PureqClient` | Add request interceptor |
| `client.useResponseInterceptor(fn)` | `PureqClient` | Add response interceptor |

### Request Methods

| Method | Throws? | Returns |
| ------ | ------- | ------- |
| `client.get(url, opts?)` | Yes | `Promise<HttpResponse>` |
| `client.getResult(url, opts?)` | Never | `Promise<Result<HttpResponse, PureqError>>` |
| `client.getJson<T>(url, opts?)` | Yes | `Promise<T>` |
| `client.getJsonResult<T>(url, opts?)` | Never | `Promise<Result<T, PureqError>>` |
| `client.post(url, body?, opts?)` | Yes | `Promise<HttpResponse>` |
| `client.postResult(url, body?, opts?)` | Never | `Promise<Result<HttpResponse, PureqError>>` |
| `client.postJson<T>(url, body?, opts?)` | Yes | `Promise<T>` |
| `client.postJsonResult<T>(url, body?, opts?)` | Never | `Promise<Result<T, PureqError>>` |
| `client.put(...)` / `putResult(...)` | — | Same pattern as post |
| `client.patch(...)` / `patchResult(...)` | — | Same pattern as post |
| `client.delete(...)` / `deleteResult(...)` | — | Same pattern as get |
| `client.fetch(url, init?)` | Yes | Familiar `fetch`-like API |
| `client.fetchResult(url, init?)` | Never | Result-wrapped fetch-like API |
| `client.fetchJson<T>(url, init?)` | Yes | fetch + JSON parse |
| `client.request(config)` | Yes | Low-level full config |
| `client.requestResult(config)` | Never | Low-level Result variant |
| `client.requestJson<T>(config)` | Yes | Low-level + JSON |
| `client.requestJsonResult<T>(config)` | Never | Low-level + JSON + Result |

### Middleware

| Middleware | Purpose |
| --------- | ------- |
| `retry(options)` | Exponential backoff, Retry-After, budget |
| `authRefresh(options)` | Automatic token refresh (thundering herd prevention) |
| `deadline(options)` | Total request budget across retries |
| `defaultTimeout(ms)` | Default per-request timeout |
| `circuitBreaker(options)` | Fail-fast on repeated failures |
| `concurrencyLimit(options)` | Cap in-flight requests |
| `dedupe(options?)` | Collapse duplicate concurrent requests |
| `hedge(options)` | Duplicate request for tail latency |
| `validation(options)` | Schema validation bridge (Zod/Valibot ready) |
| `fallback(options)` | Graceful degradation with fallback values |
| `httpCache(options)` | In-memory cache with ETag/stale-if-error |
| `createOfflineQueue(options?)` | Offline mutation queue with replay |
| `idempotencyKey(options?)` | Auto-inject idempotency headers |

### Available Presets

| Preset | Best for |
| ------ | -------- |
| `resilientPreset()` | General-purpose production stack |
| `frontendPreset()` | User-facing requests with conservative policy |
| `bffPreset()` | BFF with auth propagation and upstream stability |
| `backendPreset()` | Service-to-service under sustained load |

### Observability Exports

| Export | Purpose |
| ------ | ------- |
| `createMiddlewareDiagnostics(options)` | Collect metrics and traces |
| `createConsoleDiagnosticsExporter()` | Console logging exporter |
| `createOpenTelemetryDiagnosticsExporter(meter)` | OTel metrics exporter |
| `mapToStandardHttpAttributes(event)` | OTel semantic conventions |
| `mapToAwsSemanticConventions(event)` | AWS X-Ray attributes |
| `mapToGcpSemanticConventions(event)` | GCP Cloud Trace attributes |
| `redactHeaders(headers, options?)` | Redact sensitive headers |
| `redactObjectFields(obj, options?)` | Redact fields by pattern |
| `redactUrlQueryParams(url, options?)` | Redact URL query params |
| `piiRedactionOptions` | Pre-built PII redaction profile |
| `authRedactionOptions` | Pre-built auth redaction profile |

### Adapters and Serializers

| Export | Purpose |
| ------ | ------- |
| `fetchAdapter` | Default global fetch adapter |
| `createInstrumentedAdapter(base, hooks)` | Adapter with lifecycle hooks |
| `jsonBodySerializer` | Default JSON body serializer |
| `createFormUrlEncodedSerializer(options?)` | Form URL-encoded serializer |

---

## Security

pureq takes a defense-in-depth approach to transport layer security:

- **Type-safe Path Templates**: `/users/:id` inherently protects against accidental payload leakage or malformed URL construction compared to manual string interpolation.
- **Resource Exhaustion Defense**: Middleware like `deadline()`, `defaultTimeout()`, and `concurrencyLimit()` help mitigate backend overloading and "Slow Loris" style denial-of-service on the client.
- **Telemetry Safe-by-Default**: Use built-in diagnostics exports with `redactIndicators`, `redactHeaders`, and `redactObjectFields` to prevent PII and authentication tokens from inadvertently entering server logs or APM dashboards.
- **Explicit Serialization**: Defining body serializers restricts accidental serialization of unintended properties compared to ad-hoc `JSON.stringify`.

*Note: Standard browser-based security constructs like CSRF tokens and CORS remain the responsibility of the underlying `fetch` implementation. pureq stays out of your way and lets standard headers handle web platform security.*

---

## Development

```bash
npm run typecheck      # type checking
npm test               # all tests
npm run test:ci        # unit + integration + contract + stress + typecheck
npm run test:browser   # browser runtime smoke test
npm run test:edge      # edge runtime smoke test
npm run build          # production build
npm run benchmark      # performance benchmark
```

## Limitations

pureq is intentionally focused. A few limits are worth knowing:

- `httpCache()` is in-memory and process-local — not a distributed cache
- `hedge()` duplicates requests and should only be used for idempotent reads
- `circuitBreaker()` is per-process — for distributed circuit breaking use an external store
- JSON helpers are convenience methods, not a replacement for your domain model
- Diagnostics exporters are lightweight adapters, not a full telemetry SDK

These limits are by design. The library is meant to stay small, explicit, and composable.

## Documentation

| Document | Content |
| -------- | ------- |
| [Reliability Primitives](./docs/reliability_primitives.md) | retry, deadline, hedge, circuit breaker |
| [Cache & Offline](./docs/cache_and_offline.md) | httpCache, offlineQueue, stale-if-error |
| [Observability & Governance](./docs/observability_and_governance.md) | diagnostics, OTel, redaction, guardrails |
| [React Query Integration](./docs/integration_react_query.md) | detailed React Query patterns |
| [SWR Integration](./docs/integration_swr.md) | detailed SWR patterns |
| [BFF & Backend Templates](./docs/templates_bff_backend.md) | per-dependency client patterns |
| [Positioning](./docs/positioning_react_query_swr_bff_backend.md) | when to use what |
| [Migration Guide](./docs/migration_guide.md) | fetch/axios → pureq step by step |
| [Benchmarks](./docs/benchmarks.md) | methodology and baseline numbers |
| [Runtime Compatibility](./docs/runtime_compatibility_matrix.md) | supported runtimes |
| [Adoption Strategy](./docs/standard_adoption_strategy.md) | org-wide rollout playbook |

## License

[MIT](./LICENSE.md)
