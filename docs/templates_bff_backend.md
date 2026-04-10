# Templates: BFF and Backend Usage

This document provides reference templates for production usage.

## BFF template

```ts
import { createClient, resilientPreset, createMiddlewareDiagnostics } from "pureq";

const diagnostics = createMiddlewareDiagnostics({ maxEvents: 500 });

let upstream = createClient({
  baseURL: "https://upstream.example.com",
  requestIdHeaderName: "x-request-id",
}).use(diagnostics.middleware);

for (const mw of resilientPreset()) {
  upstream = upstream.use(mw);
}

export async function getUserBff(userId: string) {
  return upstream.getJsonResult<{ id: string; name: string }>("/users/:id", {
    params: { id: userId },
    timeout: 3000,
  });
}
```

## Backend template

```ts
import {
  createClient,
  createCircuitBreaker,
  keyByOriginAndPath,
  retry,
  createMiddlewareDiagnostics,
} from "pureq";

const diagnostics = createMiddlewareDiagnostics({ maxEvents: 1000 });
const breaker = createCircuitBreaker({
  keyBuilder: keyByOriginAndPath,
  failureThreshold: 5,
  cooldownMs: 30_000,
  maxEntries: 1000,
});

const dependency = createClient({ baseURL: "https://dependency.internal" })
  .use(diagnostics.middleware)
  .use(retry({ maxRetries: 2, delay: 200, retryOnStatus: [429, 500, 502, 503, 504] }))
  .use(breaker.middleware);

export async function callDependency() {
  return dependency.getResult("/health");
}
```

## Operational checklist

- Wire `onRequestError` and diagnostics snapshots to telemetry
- Keep retry and circuit thresholds per dependency class
- Use idempotency keys for mutation endpoints
