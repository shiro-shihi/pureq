# Observability & Governance

In large systems, understanding *why* a request behaved a certain way is as important as the data itself. **pureq** provides deep visibility into the transport lifecycle.

## 1. Client Lifecycle Hooks

You can monitor every request globally by providing hooks at the client level.

```ts
const api = createClient({
  hooks: {
    onRequestStart: (event) => {
      console.log(`→ ${event.method} ${event.url} [ID: ${event.requestId}]`);
    },
    onRequestSuccess: (event) => {
      console.log(`✓ ${event.status} in ${event.latencyMs}ms`);
    },
    onRequestError: (event) => {
      console.error(`✗ ${event.errorKind}: ${event.error.message}`);
    },
  },
});
```

---

## 2. Policy Tracing (Debuggability)

Ever wonder why a request was retried or why a circuit opened? `pureq` maintains a detailed trace of transport decisions.

```ts
import { explainPolicyTrace } from "@pureq/pureq";

try {
  await api.get("/flaky-endpoint");
} catch (err) {
  // Prints a human-readable timeline of what happened:
  // [10:00:00] RETRY: Triggered (status=503)
  // [10:00:01] RETRY: Triggered (status=503)
  // [10:00:02] CIRCUIT-BREAKER: OPEN (threshold reached)
  console.log(explainPolicyTrace(err.request));
}
```

---

## 3. Diagnostics Middleware

Collect production metrics like P95 latency, success rates, and budget consumption.

```ts
import { createMiddlewareDiagnostics, createConsoleDiagnosticsExporter } from "@pureq/pureq";

const diagnostics = createMiddlewareDiagnostics({
  onEvent: createConsoleDiagnosticsExporter().export,
});

const api = createClient().use(diagnostics.middleware);

// Get a snapshot of performance metrics
const stats = diagnostics.snapshot();
console.log(`P95 Latency: ${stats.p95}ms`);
```

---

## 4. OpenTelemetry Integration

`pureq` maps its internal events to standard OpenTelemetry (OTel) semantic conventions, making it easy to export tracing data to tools like Honeycomb, Jaeger, or Datadog.

```ts
import { mapToStandardHttpAttributes } from "@pureq/pureq";

// Inside a hook or middleware:
const otelAttributes = mapToStandardHttpAttributes(event);
// { "http.method": "GET", "http.url": "...", "http.status_code": 200, ... }
```

---

## 5. Redaction (Security)

Prevent PII (Personally Identifiable Information) or auth tokens from leaking into your logs.

```ts
import { redactHeaders, authRedactionOptions } from "@pureq/pureq";

// Automatically redact Authorization and Cookie headers
const safeHeaders = redactHeaders(headers, authRedactionOptions);
```
