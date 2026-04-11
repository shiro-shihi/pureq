# pureq

## Functional, immutable, and type-safe HTTP transport layer for TypeScript

[Get Started](./packages/pureq/docs/getting_started.md) | [Documentation](./packages/pureq/docs/README.md) | [Middleware Reference](./packages/pureq/docs/middleware_reference.md) | [GitHub](https://github.com/shiro-shihi/pureq)

---

pureq is a policy-first transport layer that makes HTTP behavior explicit, composable, and observable across frontend, BFF, backend, and edge runtimes. It is designed to replace ad-hoc fetch wrappers with a robust, immutable system for managing engineering-grade reliability.

```ts
import { createClient, retry, circuitBreaker, dedupe } from "pureq";

const api = createClient({ baseURL: "https://api.example.com" })
  .use(dedupe())                                         // collapse duplicate in-flight GETs
  .use(retry({ maxRetries: 2, delay: 200 }))             // exponential backoff
  .use(circuitBreaker({ failureThreshold: 5, cooldownMs: 30_000 })); // stop on outages

// GET + status check + JSON parse + typed path params
const user = await api.getJson<User>("/users/:id", { params: { id: "42" } });
```

## Philosophy

The core philosophy of pureq is that **transport is a policy**. Communication between services should not be hidden behind imperative logic or mutable configurations. Instead, pureq treats reliability, observability, and security as first-class citizens that are composed as immutable layers.

- **Immutability as Safety**: Every change to a client returns a new instance, preventing side-effects across shared infrastructure.
- **Failures as Values**: Through the Result pattern, errors are treated as data to be handled explicitly, not exceptions that disrupt the flow.
- **Policy over Code**: Reliability logic (retries, timeouts, breakers) is declared as a policy stack, separated from the business logic of individual requests.

## Key Features

- **Immutable Client Composition**: Safely branch and share transport configurations without mutation leaks.
- **Onion Model Middleware**: Powerful, composable async lifecycle control for retries, caching, and circuit breaking.
- **Strictly Type-Safe**: Compile-time validation for URL path parameters and response schema structures.
- **Non-throwing API**: Native support for the Result pattern to ensure exhaustive error handling.
- **Zero Runtime Dependencies**: Ultra-lightweight core that works in any JS environment (Node, Browser, Bun, Edge).
- **Enterprise Observability**: Built-in policy tracing, performance metrics, and OpenTelemetry mapping.

## Documentation Index

| Guide | Description |
| --- | --- |
| [Getting Started](./packages/pureq/docs/getting_started.md) | Installation and your first request |
| [Core Concepts](./packages/pureq/docs/core_concepts.md) | Immutability, the Onion Model, and Path Typing |
| [Middleware Reference](./packages/pureq/docs/middleware_reference.md) | Detailed guide for all reliability policies |
| [Error Handling](./packages/pureq/docs/error_handling.md) | The Result pattern and Error codes reference |
| [Observability](./packages/pureq/docs/observability.md) | Lifecycle hooks, metrics, and OTel integration |
| [Integrations](./packages/pureq/docs/README.md#integrations) | React Query, SWR, and Backend patterns |

## Installation

```bash
npm install @pureq/pureq
```

For Node.js specific adapters (FileSystem storage, etc.), use the node subpath:

```ts
import { FileSystemQueueStorageAdapter } from "pureq/node";
```

## Usage Example

```ts
import { createClient, frontendPreset } from "pureq";

// Initialize with production-ready defaults
const api = createClient({
  baseURL: "https://api.example.com",
  middlewares: frontendPreset(),
});

// Type-safe GET request
const result = await api.getJsonResult<User>("/users/:id", {
  params: { id: "42" }
});

if (result.ok) {
  console.log(result.data.name);
} else {
  console.error(result.error.kind); // e.g., 'timeout', 'network', 'http'
}
```

## License

MIT © [Shihiro](https://github.com/shiro-shihi)
