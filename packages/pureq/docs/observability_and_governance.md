# Observability and Governance

This document formalizes how pureq exposes transport behavior and how it prevents unsafe or ambiguous policy composition.

## 1. Purpose

pureq treats transport as a policy layer, not just a request helper.
That means the library must answer two questions well:

- What happened on this request?
- Was this client configuration valid in the first place?

The observability and governance surface is how pureq answers those questions.

## 2. What exists today

### Client request lifecycle hooks

`createClient()` supports hooks for start, success, and error events.
The event model includes:

- `phase`
- `at`
- `requestId`
- `method`
- `url`
- `startedAt`
- `latencyMs` / `durationMs`
- `status`
- `retryCount`
- `errorKind`
- `error` on failures

Example:

```ts
import { createClient } from "pureq";

const client = createClient({
  hooks: {
    onRequestStart: (event) => {
      console.log(event.phase, event.requestId, event.method, event.url);
    },
    onRequestSuccess: (event) => {
      console.log(event.phase, event.requestId, event.status, event.retryCount);
    },
    onRequestError: (event) => {
      console.error(event.phase, event.requestId, event.errorKind, event.error.metadata);
    },
  },
});
```

### Middleware diagnostics

`createMiddlewareDiagnostics()` collects request-level transport events and exposes:

- totals
- success and failure counts
- duration percentiles
- recent events

Those events include the same shared transport shape and can carry policy trace entries.

Example:

```ts
import {
  createClient,
  createMiddlewareDiagnostics,
  createConsoleDiagnosticsExporter,
} from "pureq";

const diagnostics = createMiddlewareDiagnostics();
const exporter = createConsoleDiagnosticsExporter();

const client = createClient().use(diagnostics.middleware);
const result = await client.getResult("https://api.example.com/health");

exporter.export(diagnostics.snapshot().recentEvents.at(-1)!);
```

### Exporters

pureq ships two exporter shapes today:

- `createConsoleDiagnosticsExporter()`
- `createOpenTelemetryDiagnosticsExporter()`

The OpenTelemetry exporter is intentionally lightweight. It maps request events into counter and histogram calls, but it is not a full semantic-conventions SDK.

### Observability helpers

pureq also exports helper functions for platform integration:

- `mapTransportEventToOtelAttributes()`
- `redactHeaders()`
- `redactObjectFields()`

### Policy trace entries

Retry, hedge, and cache middleware can attach policy trace entries into request metadata.
Diagnostics surfaces those traces so you can see why a request was retried, hedged, cached, or served stale.

### Guardrails

`validatePolicyGuardrails()` is exported, and `createClient()` applies the same validation at creation time.

Current guardrails reject:

- multiple retry policies in one client
- `deadline()` combined with `defaultTimeout()`
- retry counts that are obviously excessive for the library’s intended default envelope

Example:

```ts
import { createClient, deadline, defaultTimeout } from "pureq";

createClient({
  middlewares: [defaultTimeout(1000), deadline({ defaultTimeoutMs: 1000 })],
});
```

## 3. Recommended usage patterns

### Frontend and BFF

Use request hooks when you want lightweight logging, request IDs, or trace propagation.
Use middleware diagnostics when you want policy-level visibility across retries, dedupe, cache, and hedging.

### Backend services

Use diagnostics snapshots for local inspection and exporter output for metrics pipelines.
Pair this with dependency-specific retry/circuit settings and request IDs in log correlation.

## 4. What pureq does not do yet

pureq does not ship a complete tracing backend or log pipeline.
It also does not provide a full OpenTelemetry semantic-conventions package with spans/traces/log schemas.
The current design is intentionally small:

- hooks for request lifecycle events
- diagnostics middleware for transport observations
- exporter adapters for logging and metrics systems
- event-to-attribute mapping and redaction helpers
- policy guardrails for bad combinations

That keeps the contract explicit without pretending to be a full observability platform.

## 5. Practical guidance

- Treat `retryCount` and `policyTrace` as part of your incident triage data.
- Use guardrails when building shared client factories for teams.
- Prefer diagnostics middleware when you need to answer "why did this request behave that way?" rather than just "how many requests happened?".
