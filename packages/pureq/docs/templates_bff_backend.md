# Templates: BFF and Backend Usage

This document provides production-ready templates for using **pureq** in server-side environments like BFFs (Backend-for-Frontend) and microservices.

## BFF Template (Edge / Node.js)

For BFFs, we prioritize a balance between low latency and observability.

```ts
import { 
  createClient, 
  resilientPreset, 
  createMiddlewareDiagnostics 
} from "@pureq/pureq";

// 1. Initialize diagnostics for production monitoring
const diagnostics = createMiddlewareDiagnostics({ maxEvents: 500 });

// 2. Compose the upstream client with a resilient preset
let upstream = createClient({
  baseURL: process.env.UPSTREAM_API_URL,
  requestIdHeaderName: "x-request-id",
}).use(diagnostics.middleware);

// Apply the standard resilient stack
for (const mw of resilientPreset()) {
  upstream = upstream.use(mw);
}

// 3. Export typed handlers
export async function getUserBff(userId: string) {
  return upstream.getJsonResult<{ id: string; name: string }>("/users/:id", {
    params: { id: userId },
    timeout: 3000,
  });
}
```

## Backend Template (Aggressive Reliability)

For internal service-to-service communication, we favor aggressive retries and fast circuit breakers.

```ts
import {
  createClient,
  createCircuitBreaker,
  keyByOriginAndPath,
  retry,
  createMiddlewareDiagnostics,
} from "@pureq/pureq";

const diagnostics = createMiddlewareDiagnostics({ maxEvents: 1000 });

// 1. Configure a custom circuit breaker for internal dependencies
const breaker = createCircuitBreaker({
  keyBuilder: keyByOriginAndPath,
  failureThreshold: 5,
  cooldownMs: 30_000,
  maxEntries: 1000,
});

// 2. Compose the client with exhaustive retry policies
const dependency = createClient({ 
  baseURL: "https://internal-service.local", 
  headers: { "X-Internal-Secret": process.env.SERVICE_SECRET }
})
  .use(diagnostics.middleware)
  .use(retry({ 
    maxRetries: 3, 
    delay: 200, 
    retryOnStatus: [429, 500, 502, 503, 504] 
  }))
  .use(breaker.middleware);

export async function checkDependencyHealth() {
  return dependency.getResult("/health");
}
```

---

## Operational Checklist

When deploying **pureq** in professional backend environments, ensure you follow these guidelines:

1. **Telemetry Binding**: Always wire `onRequestError` and diagnostics snapshots to your logging system (e.g., Datadog, Sentry, or ELK).
2. **Threshold Tuning**: Adjust retry budgets and circuit breaker thresholds based on the specific SLA (Service Level Agreement) of each dependency.
3. **Idempotency keys**: Ensure mutation endpoints use `idempotencyKey()` middleware, especially when using an `offlineQueue`.
4. **Environment Isolation**: Prevent client configuration from leaking across different upstream services by leveraging `pureq`'s immutable branching (`.use()`).
