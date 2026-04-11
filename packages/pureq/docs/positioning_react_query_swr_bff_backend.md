# Positioning: pureq vs React Query / SWR and BFF / Backend Usage

This document clarifies where pureq fits relative to React Query and SWR, and how usage differs in BFF and backend services.

## 1. Role Separation

- pureq: transport and HTTP policy layer (request execution, middleware, retries, observability, error contract).
- React Query / SWR: server-state orchestration layer (cache lifecycle, stale-while-revalidate, background refetch, UI sync).

They are complementary, not replacements.

## 2. pureq vs React Query / SWR

| Concern | pureq | React Query / SWR |
|---|---|---|
| Typed route params | Strong | Depends on your fetcher typing |
| Middleware policy | First-class | Usually delegated to fetcher |
| Retry control | Middleware policy | Built-in retry, but UI-focused |
| Request observability hooks | First-class | Not transport-first by default |
| Cache lifecycle | Minimal (dedupe only) | First-class cache/state engine |
| Mutation state machine | Minimal | First-class |
| Best fit | Cross-runtime HTTP standardization | React UI server-state management |

## 3. Recommended Integration Pattern

Use pureq as the fetcher boundary, and React Query/SWR as the UI state boundary.

### React Query example

```ts
import { createClient, retry, dedupe } from "pureq";
import { useQuery } from "@tanstack/react-query";

const client = createClient({ baseURL: "/api" })
  .use(dedupe())
  .use(retry({ maxRetries: 2, delay: 200 }));

export function useUser(userId: string) {
  return useQuery({
    queryKey: ["user", userId],
    queryFn: async () => {
      return client.getJson<{ id: string; name: string }>("/users/:id", {
        params: { id: userId },
      });
    },
  });
}
```

### SWR example

```ts
import useSWR from "swr";
import { createClient } from "pureq";

const client = createClient({ baseURL: "/api" });

const fetcher = (path: string) => client.getJson(path);

export function useProjects() {
  return useSWR("/projects", fetcher);
}
```

## 4. What Changes in BFF vs Backend

## BFF (Backend for Frontend)

Primary goal:
- Frontend-aligned API composition and latency control.

Typical pureq usage:
- Strong use of dedupe and timeout policy to absorb UI bursts.
- Trace context propagation from browser to downstream services.
- Request/response interceptors for auth/session propagation.
- Consistent Result API mapping for predictable frontend error handling.

Why it matters:
- BFFs often aggregate multiple upstream calls; standardized retries and observability reduce triage time.

## Backend service to service

Primary goal:
- Reliability, resilience, and operational visibility across internal calls.

Typical pureq usage:
- Retry policy per dependency class with stricter status lists.
- Adapter instrumentation for service metrics.
- Rich error metadata for incident response (requestId, retryCount, rootCause).
- Serializer customization for protocol-specific payload requirements.

Why it matters:
- Backend workloads need deterministic transport behavior and clear failure taxonomy more than UI cache semantics.

## 5. Practical Decision Guide

Use pureq alone when:
- You need a runtime-agnostic HTTP standard layer.
- You want deterministic middleware policies and typed routing.

Use pureq + React Query/SWR when:
- You build React UIs that need cache invalidation, stale management, and mutation orchestration.

Use pureq in BFF/backend when:
- You need consistent transport rules and observability independent of UI framework.
