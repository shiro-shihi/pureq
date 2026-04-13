# pureq Migration Guide

This guide provides a comprehensive path for migrating from `fetch` or `axios` to `pureq`. It covers conceptual codemaps, practical steps, and specific syntax transformations.

## 1. Migration Goals

- Centralize transport policy in one immutable client layer.
- Make retry/timeout/dedupe/circuit behavior explicit and testable.
- Adopt non-throwing Result flows for machine-safe error handling.

## 2. Recommended Migration Order

1. **Replace low-risk read paths:** Start with `createClient()` + `getResult()` on safe GET requests.
2. **Add standard middleware:** Introduce a baseline policy stack (`deadline`, `retry`, `concurrencyLimit`).
3. **Migrate mutation paths:** Adopt `idempotencyKey`, explicit timeouts, and offline queues for data modifications.
4. **Enable observability:** Add diagnostics hooks for policy behavior visibility.

## 3. Migration Codemap

### fetch to pureq

| Existing pattern | pureq target |
| --- | --- |
| direct fetch per call | shared `createClient` |
| custom retry loops | `retry` middleware |
| ad-hoc dedupe logic | `dedupe` middleware |
| manual timeout/abort wiring | built-in timeout/signal support |
| throw/catch everywhere | `*Result` APIs |

### axios to pureq

| Existing pattern | pureq target |
| --- | --- |
| `axios.create` mutable instance | immutable `createClient` chain |
| request/response interceptors | pureq interceptors |
| adapter overrides | `adapter` boundary |
| transformRequest | `bodySerializer` boundary |
| hidden global defaults | explicit middleware stack |

---

## 4. Specific Migration Examples

### Fetch -> pureq

**Before:**

```ts
const res = await fetch(`https://api.example.com/users/${id}`, {
  headers: { Authorization: `Bearer ${token}` },
});

if (!res.ok) {
  throw new Error(`HTTP ${res.status}`);
}

const user = await res.json() as { id: string; name: string };
```

**After:**

```ts
import { createClient } from "pureq";

const client = createClient({
  baseURL: "https://api.example.com",
  headers: { Authorization: `Bearer ${token}` },
});

// JSON extraction and HTTP status checking combined safely
const user = await client.getJson<{ id: string; name: string }>("/users/:id", {
  params: { id },
});
```

*Using the Non-throwing Result API:*

```ts
const result = await client.getJsonResult<{ id: string; name: string }>("/users/:id", {
  params: { id },
});

if (!result.ok) {
  console.error(result.error.kind, result.error.metadata);
  return;
}

console.log(result.data.name);
```

### Axios -> pureq

**Before (Axios Instance Formulation):**

```ts
import axios from "axios";

const api = axios.create({
  baseURL: "https://api.example.com",
  headers: { "X-App": "demo" },
  timeout: 3000,
});

api.interceptors.request.use((req) => {
  req.headers.Authorization = "Bearer token";
  return req;
});
```

**After (pureq Immutable Formulation):**

```ts
import { createClient } from "pureq";

// Base client
const baseApi = createClient({
  baseURL: "https://api.example.com",
  headers: { "X-App": "demo" },
});

// Interceptors return a *new* immutable client chain
const api = baseApi.useRequestInterceptor((req) => ({
  ...req,
  headers: { ...req.headers, Authorization: "Bearer token" },
}));

// Call with explicit timeout per action (or use a middleware mapping)
await api.get("/users/:id", { params: { id: "42" }, timeout: 3000 });
```

## 5. Rollout Strategy

1. **Deploy tools**: Before hand-modifying large files, consider using provided [codemod recipes](../tools/codemods/README.md).
2. **Canary test**: Enable pureq for 10% traffic paths or in one bounded, non-critical module.
3. **Establish Profiles**: Pre-configure standard [Profiles](../tools/profile-generator/README.md) across different apps depending on their execution runtime (e.g. BFF vs Frontend).
4. **Compare**: Cross-check error rates and timeouts.
5. **Scale**: Expand to the remaining endpoints after no-regression checks.
6. **Clean**: Remove legacy transport helpers, redundant global fetch setups, or axios instances.
