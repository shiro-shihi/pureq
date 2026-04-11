# Runtime Compatibility Matrix

This matrix defines the currently validated runtime contract for pureq.

## Core Runtime Support

| Runtime | Status | Notes |
| --- | --- | --- |
| Modern Browsers (Fetch API) | Supported | Requires global fetch, AbortController, URL, and Response |
| Node.js 18+ | Supported | Uses built-in fetch/undici |
| Node.js 16 and older | Not supported by default | Requires a fetch polyfill and extra setup |
| Edge Runtime (Fetch-based) | Supported with caution | Avoid Node-only dependencies in user interceptors |
| Deno (Fetch-based) | Expected to work | Not yet in automated CI validation |

## Feature-Level Contract

| Feature | Browser | Node 18+ | Notes |
| --- | --- | --- | --- |
| createClient / middleware compose | Yes | Yes | Same API contract |
| retry middleware | Yes | Yes | Exponential backoff and onRetry callback |
| timeout + abort | Yes | Yes | AbortSignal and timeout integration |
| Result API (`*Result`) | Yes | Yes | Non-throwing transport error handling |
| JSON helpers (`getJson` / `postJson`) | Yes | Yes | Throws on invalid JSON in throwing variants |
| observability hooks | Yes | Yes | requestId, latency, retryCount, error metadata |
| trace context propagation | Yes | Yes | `traceparent` and `tracestate` header forwarding |
| response stream helper | Yes | Yes | Depends on runtime ReadableStream implementation |

## Baseline Requirements

- TypeScript target aligned with Fetch API-capable environments.
- Global fetch available (native or polyfilled by host application).
- AbortController available for timeout and cancellation behavior.

## Validation Scope

Current automated checks include:

- Unit tests
- Integration smoke test
- Public API contract test
- Stress-style retry loop test

Future expansion targets:

- Deno CI lane
- Browser matrix via Playwright/Web Test Runner
- Edge-runtime CI lane
