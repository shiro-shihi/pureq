# Reliability Primitives

This document formalizes the reliability middleware that **pureq** ships to maintain system stability.

## 1. Goal

The goal is to make transport behavior explicit under load, failure, and tail-latency pressure. By defining these behaviors as primitives, we ensure consistent and predictable communication across a distributed system.

## 2. Available primitives today

### Retry

`retry()` provides:

- Exponential backoff
- Retry-After awareness
- Optional status allow-listing
- Retry budget control
- Network retry handling
- Policy trace entries for observability

### Deadline

`deadline()` enforces a total request budget across retries. This is different from a per-attempt timeout, as it limits the cumulative time spent on a single operation regardless of how many retries occur.

### Concurrency limit

`concurrencyLimit()` caps active in-flight requests globally or by key. This is essential for protecting downstream services from thundering herds.

### Dedupe

`dedupe()` collapses concurrent duplicate requests into one in-flight execution. It is highly effective for heavy read traffic where multiple components might request the same resource simultaneously.

### Hedge

`hedge()` launches a second read after a short delay to reduce tail latency. The first response to return wins, and the second is aborted. Use this when the cost of duplication is lower than the cost of high latency.

### HTTP cache

`httpCache()` adds in-memory response reuse with ETag revalidation and stale-if-error fallback.

---

## 3. Composition guidance

The order of middleware determines the execution flow. Recommended order for many read flows:

1. `dedupe()`
2. `httpCache()`
3. `deadline()`
4. `retry()`
5. `hedge()` (Only when the use case justifies the extra upstream pressure)

This order reflects the principle that **cheaper reuse should happen before more expensive recovery**.

---

## 4. What these primitives are not

These middleware are not a hidden autonomous control plane. They do not:

- Infer business semantics.
- Decide whether your request is safe to retry or cache (this must be configured).
- Mask persistent architectural failures.

They expose policy knobs and leave the application logic in control.

## 5. Stress and validation guidance

When adopting these primitives in a production environment, ensure you test:

- Request cancellation propagation.
- Retry budget exhaustion behavior.
- Deadline and retry interaction (total vs per-attempt).
- Concurrent limit contention under high load.
- Stale-if-error fallback during upstream outages.
- Hedge interaction with upstream failures.

These are the behaviors that tend to regress first in real-world traffic scenarios.
