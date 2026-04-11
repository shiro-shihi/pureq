# Beyond Axios: From Imperative Requests to Declarative Transport Policies with pureq

Most TypeScript teams still start with one default answer for HTTP: "just use Axios".

That was a good answer for years.
But today, the core challenge is no longer sending requests. It is designing transport behavior that stays reliable, observable, and maintainable as systems grow.

That is a paradigm shift:

- Imperative style (per-call patches and interceptor side effects)
- Declarative policy style (explicit, composable transport rules)

pureq is built for the second model.

- GitHub: [https://github.com/shiro-shihi/pureq](https://github.com/shiro-shihi/pureq)
- npm: [https://www.npmjs.com/package/@pureq/pureq](https://www.npmjs.com/package/@pureq/pureq)

## Why Existing Options Start to Hurt

### Native fetch: flexible, but incomplete by default

`fetch` gives you primitives, not a reliability system. Teams usually rebuild:

- Timeout/deadline behavior
- Retry rules
- Circuit breaker logic
- Deduplication
- Unified error classification

This often leads to duplicated utilities and inconsistent behavior across services.

### Axios: ergonomic, but increasingly implicit at scale

Axios interceptors are useful, but large codebases tend to hit:

- Hidden side effects
- Order-dependent behavior that is hard to audit
- Blurred boundaries between clients (public/auth/admin/internal)

## fetch vs Axios vs pureq (At a Glance)

| Capability | fetch | Axios | pureq |
| --- | --- | --- | --- |
| Immutable client composition | No | No (instance config is mutable) | Yes (`use()` returns a new client) |
| Resilience policies (retry/circuit/deadline/dedupe) | Manual | Partial/custom interceptor logic | First-class middleware |
| Middleware ordering model | Manual wrappers | Interceptor chains | Explicit onion model |
| Result pattern (non-throwing API) | Manual | Mostly exception-first | Built-in `*Result` APIs |
| Observability hooks / OTel mapping | Manual | Manual | Built-in diagnostics + OTel mapping |
| Runtime dependencies | N/A (platform API) | External package | Zero runtime dependencies |

## What pureq Is

pureq is a policy-first HTTP transport layer for TypeScript.

Core ideas:

- Policy-first design
- Immutable clients
- Composable middleware stack
- Result-oriented error handling

Also important in practice:

- Zero runtime dependencies (lightweight core)
- Works across browser, Node.js, and edge-like runtimes

## Quick Start

```bash
npm install @pureq/pureq
```

```ts
import { createClient } from "@pureq/pureq";

const api = createClient({
  baseURL: "https://api.example.com",
  headers: {
    "Content-Type": "application/json",
  },
});
```

## Design Highlights

### 1. Immutable composition

`use()` does not mutate the existing client.

```ts
import { createClient, retry, authRefresh, dedupe } from "@pureq/pureq";

const base = createClient({ baseURL: "https://api.example.com" })
  .use(retry({ maxRetries: 2, delay: 300 }));

const privateApi = base.use(
  authRefresh({
    status: 401,
    refresh: async () => getNewToken(),
  })
);

const publicApi = base.use(dedupe());
```

This makes policy branching explicit and safe.

### 2. Explicit middleware order (Onion model)

```ts
import { createClient, dedupe, retry, circuitBreaker } from "@pureq/pureq";

const resilientApi = createClient({ baseURL: "https://api.example.com" })
  .use(dedupe())
  .use(
    retry({
      maxRetries: 3,
      delay: 200,
      retryOnStatus: [429, 500, 503],
    })
  )
  .use(
    circuitBreaker({
      failureThreshold: 5,
      cooldownMs: 30_000,
    })
  );
```

## Built-in Capabilities

- retry
- circuit breaker
- dedupe
- timeout / deadline
- auth refresh
- hedged requests
- concurrency limits
- HTTP cache
- offline queue
- validation / fallback
- diagnostics and OpenTelemetry mapping

## Validation Example (Zod/Valibot Friendly)

pureq ships a zero-dependency validation middleware that can bridge external schema libraries.

```ts
import { createClient, validation } from "@pureq/pureq";
import { z } from "zod";

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const api = createClient({ baseURL: "https://api.example.com" }).use(
  validation({
    validate: (data) => UserSchema.parse(data),
    message: "Response validation failed",
  })
);
```

The same shape works with Valibot validators as well.

## Result Pattern: Errors as Values, Not Exceptions

pureq separates transport failures and HTTP failures via typed Result unions.

```ts
const result = await api.getJsonResult<User>("/users/:id", {
  params: { id: "42" },
});

if (!result.ok) {
  switch (result.error.kind) {
    case "timeout":
      showToast("Request timed out");
      break;
    case "circuit-open":
      showFallbackUI();
      break;
    case "http":
      if (result.error.status === 401) {
        logout();
      }
      break;
    default:
      reportError(result.error);
  }
  return;
}

// TypeScript narrows here: result is { ok: true; data: User }
renderUser(result.data);
```

Why this matters:

- Better exhaustiveness and discoverability in code review
- Fewer hidden throw paths in async call chains
- Stronger type safety for success/failure handling

## Works Well with React Query / SWR

Use pureq for transport policy, then layer state tools on top.

```ts
import { useQuery } from "@tanstack/react-query";

function useUser(id: string) {
  return useQuery({
    queryKey: ["user", id],
    queryFn: async () => {
      const result = await api.getJsonResult<User>("/users/:id", {
        params: { id },
      });

      if (!result.ok) {
        throw result.error;
      }

      return result.data;
    },
  });
}
```

## Where pureq Fits Best

- Large frontends with shared transport policy
- BFF/backends with reliability and observability requirements
- Multi-runtime deployments including edge environments
- Teams that need predictable, auditable transport behavior

## Where It May Be Overkill

- Very small apps with minimal HTTP complexity
- Short-lived prototypes
- Cases where speed of initial setup matters more than long-term policy consistency

## Distribution Strategy by Platform

### Dev.to / Hashnode

Keep this long-form structure and explain the architectural shift clearly: "why imperative Axios-era patterns become fragile, and why policy-driven transport scales better."

### X / Twitter

Compress to a 4-slide format:

1. "Pain points in Axios-era transport"
2. "fetch vs Axios vs pureq table"
3. "Before/after code: interceptor patching vs policy composition"
4. "Result pattern and observability in one screenshot"

### LinkedIn

Lead with team-scale outcomes:

- Maintainability in multi-team codebases
- Reliability policy standardization
- Observability integration (including OpenTelemetry mapping)

## Final Note

pureq is not trying to be "yet another HTTP helper".
It is a transport design model: explicit policies, immutable composition, and typed failure handling.

I actively dogfood pureq in production workloads and keep evolving it based on real incidents and maintenance pressure.

If this aligns with your architecture goals:

- Star the repo: [https://github.com/shiro-shihi/pureq](https://github.com/shiro-shihi/pureq)
- Try the package: [https://www.npmjs.com/package/@pureq/pureq](https://www.npmjs.com/package/@pureq/pureq)
- Open an issue with feedback or edge cases you want covered
