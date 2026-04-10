# Cache and Offline Behavior

This document describes the cache-related features that exist today in pureq, and the offline behavior that remains intentionally out of scope.

## 1. What exists today

### In-memory HTTP cache

pureq ships `httpCache()` as a process-local middleware.
It is designed for read-heavy traffic where duplicate request suppression and revalidation are useful.

Current behavior:

- defaults to `GET`
- supports custom `methods`
- uses `ttlMs` as a freshness window
- supports `staleIfErrorMs` as a fallback window
- sends `If-None-Match` when it has an ETag
- sends `If-Modified-Since` when it has a Last-Modified value
- stores successful responses in memory
- serves a stale response if the upstream request fails and the entry is still within the stale-if-error window

Example:

```ts
import { createClient, httpCache } from "pureq";

const client = createClient().use(
  httpCache({
    ttlMs: 10_000,
    staleIfErrorMs: 60_000,
  })
);
```

### Stale policy helper

`resolveStalePolicy()` is a small helper that decides whether cached content is fresh or stale-but-servable.
It is intentionally simple and local to the current process.

### Dedupe relationship

`dedupe()` and `httpCache()` solve different problems:

- `dedupe()` collapses concurrent identical in-flight requests
- `httpCache()` reuses already-fetched responses when they are still valid

They can be used together.

## 2. What cache means in pureq

pureq’s cache middleware is not a distributed cache.
It does not persist across restarts.
It does not synchronize across tabs, workers, or machines.
It is an in-memory policy layer for the current process.

That is deliberate.
If you need a shared cache, use an application cache, CDN, service worker, or dedicated storage layer.

## 3. Stale-if-error usage

`staleIfErrorMs` is for resiliency, not for hiding repeated upstream failure forever.
Use it when a stale response is still useful and correctness allows it.

Good fits:

- read-heavy dashboards
- non-critical metadata lookups
- list views that can tolerate briefly stale content

Bad fits:

- security-sensitive decisions
- inventory or balance checks that must be current
- data where stale content would be misleading

## 4. Offline behavior

pureq now ships `offlineQueue()` / `createOfflineQueue()` for in-memory mutation replay when offline.
This queue is process-local and non-durable.

There is still no built-in persistent replay engine, queue store, or conflict resolution layer.

Durable offline replay remains future work because it needs more than transport middleware:

- durable storage
- replay ordering
- idempotency policy
- conflict handling
- retry and backoff coordination

Until durable replay exists in core, production offline guarantees should still be handled at the application or service-worker layer.

## 5. Practical integration guidance

### With React Query or SWR

Use pureq cache middleware for transport-level response reuse.
Use React Query or SWR for UI cache lifecycle, invalidation, and background revalidation.

### With retry and hedge

Use `httpCache()` before you reach for more aggressive reliability controls.
A cached response is cheaper than a retry storm or a hedge.

### With backend services

Use cache only for responses that are safe to reuse inside one process and one freshness envelope.
Be explicit about what a cached response means for your downstream contract.
