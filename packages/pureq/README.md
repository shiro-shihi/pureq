# pureq

Functional, immutable, and type-safe HTTP transport layer for TypeScript.

[Getting Started](https://github.com/shiro-shihi/pureq/blob/main/packages/pureq/docs/getting_started.md) | [Documentation](https://github.com/shiro-shihi/pureq/blob/main/packages/pureq/docs/README.md) | [Middleware Reference](https://github.com/shiro-shihi/pureq/blob/main/packages/pureq/docs/middleware_reference.md) | [GitHub](https://github.com/shiro-shihi/pureq)

---

pureq is a policy-first transport layer that makes HTTP behavior explicit, composable, and observable across frontend, BFF, backend, and edge runtimes.

```ts
import { createClient, retry, circuitBreaker, dedupe } from "@pureq/pureq";

const api = createClient({ baseURL: "https://api.example.com" })
  .use(dedupe())
  .use(retry({ maxRetries: 2, delay: 200 }))
  .use(circuitBreaker({ failureThreshold: 5, cooldownMs: 30_000 }));

const user = await api.getJson<User>("/users/:id", { params: { id: "42" } });
```

## Highlights

- Immutable client composition
- Onion model middleware
- Typed path params
- Result-based error handling
- No runtime dependencies
- Works in Node, browser, and edge runtimes

## Documentation

- [Getting Started](https://github.com/shiro-shihi/pureq/blob/main/packages/pureq/docs/getting_started.md)
- [Core Concepts](https://github.com/shiro-shihi/pureq/blob/main/packages/pureq/docs/core_concepts.md)
- [API Reference](https://github.com/shiro-shihi/pureq/blob/main/packages/pureq/docs/api_reference.md)
- [Middleware Reference](https://github.com/shiro-shihi/pureq/blob/main/packages/pureq/docs/middleware_reference.md)
- [Error Handling](https://github.com/shiro-shihi/pureq/blob/main/packages/pureq/docs/error_handling.md)
- [Observability](https://github.com/shiro-shihi/pureq/blob/main/packages/pureq/docs/observability.md)
- [Migration Guide](https://github.com/shiro-shihi/pureq/blob/main/packages/pureq/docs/migration_guide.md)
- [JsonResult API Reference & Migration](https://github.com/shiro-shihi/pureq/blob/main/packages/pureq/docs/json_result_reference_and_migration.md)
- [Benchmarks](https://github.com/shiro-shihi/pureq/blob/main/packages/pureq/docs/benchmarks.md)

## License

MIT
