# Reliability Primitives

This document formalizes the reliability middleware that pureq already ships.

## 1. Goal

The goal is to make transport behavior explicit under load, failure, and tail-latency pressure.

## 2. Available primitives today

### Retry

`retry()` provides:

- exponential backoff
- Retry-After awareness
- optional status allow-listing
- retry budget control
- network retry handling
- policy trace entries for observability

### Deadline

`deadline()` enforces a total request budget across retries.
This is different from a per-attempt timeout.

### Concurrency limit

`concurrencyLimit()` caps active in-flight requests globally or by key.

### Dedupe

`dedupe()` collapses concurrent duplicate requests into one in-flight execution.

### Hedge

`hedge()` launches a second read after a delay to reduce tail latency when the cost of duplication is acceptable.

### HTTP cache

`httpCache()` adds in-memory response reuse with ETag revalidation and stale-if-error fallback.

## 3. Composition guidance

Recommended order for many read flows:

1. `dedupe()`
2. `httpCache()`
3. `deadline()`
4. `retry()`
5. `hedge()` only when the use case justifies the extra upstream pressure

That order is not absolute, but it reflects the common principle that cheaper reuse should happen before more expensive recovery.

## 4. What these primitives are not

These middleware are not a hidden autonomous control plane.
They do not infer business semantics.
They do not decide whether your request is safe to retry or cache.
They expose policy knobs and leave the application in control.

## 5. Stress and validation guidance

When adopting these primitives, test:

- request cancellation
- retry budget exhaustion
- deadline and retry interaction
- concurrent limit contention
- stale-if-error fallback
- hedge interaction with upstream failures

These are the behaviors that tend to regress first in real traffic.
