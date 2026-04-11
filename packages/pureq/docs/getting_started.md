# Getting Started with pureq

Welcome to **pureq**, a functional, immutable, and type-safe HTTP transport layer for TypeScript. This guide will help you go from installation to making your first reliable API calls.

## Installation

Install the core package using your preferred package manager:

```bash
npm install @pureq/pureq
# or
yarn add @pureq/pureq
# or
pnpm add @pureq/pureq
```

## Your First Client

Unlike other libraries that use global configuration or mutable instances, `pureq` uses **immutable client composition**. You create a base client and then "compose" behavior onto it.

```ts
import { createClient } from "@pureq/pureq";

// 1. Create a base client
const api = createClient({
  baseURL: "https://api.example.com",
  headers: {
    "Content-Type": "application/json",
  },
});
```

## Making Simple Requests

`pureq` provides high-level methods like `getJson`, `postJson`, etc., which handle status code checking and JSON parsing automatically.

```ts
type User = { id: string; name: string };

// GET request with type-safe path parameters
const user = await api.getJson<User>("/users/:userId", {
  params: { userId: "42" },
});

console.log(`Hello, ${user.name}!`);

// POST request with a JSON body
const newUser = await api.postJson<User>("/users", {
  name: "Alice",
});
```

## Adding Reliability (Middleware)

The power of `pureq` comes from its middleware. You can add retries, circuit breakers, and more by calling `.use()`. Each call returns a *new* client instance.

```ts
import { retry, circuitBreaker } from "@pureq/pureq";

const resilientApi = api
  .use(retry({ maxRetries: 3, delay: 200 }))
  .use(circuitBreaker({ failureThreshold: 5, cooldownMs: 30_000 }));

// This request will now automatically retry on failure!
const data = await resilientApi.getJson("/data");
```

## Robust Error Handling

In production, network requests often fail. Instead of `try/catch`, `pureq` encourages the **Result Pattern** using `*Result` methods. These methods never throw; instead, they return an object that tells you if the request succeeded or failed.

```ts
const result = await resilientApi.getJsonResult<User>("/users/:id", {
  params: { id: "42" },
});

if (!result.ok) {
  // Handle the error explicitly based on its "kind"
  switch (result.error.kind) {
    case "network":
      console.error("No internet connection.");
      break;
    case "timeout":
      console.error("The request took too long.");
      break;
    case "http":
      console.error(`Server responded with ${result.error.status}`);
      break;
    default:
      console.error("Something went wrong:", result.error.message);
  }
  return;
}

// result.data is safe to use here
console.log(result.data.name);
```

## Next Steps

Now that you've mastered the basics, explore the deeper capabilities of `pureq`:

- [Core Concepts](./core_concepts.md): Understand Immutability and the Onion Model.
- [Middleware Reference](./middleware_reference.md): See all the available reliability policies.
- [Error Handling](./error_handling.md): Learn about advanced error classification and exhaustive matching.
- [Integrations](./integration_react_query.md): Use `pureq` with React Query or SWR.
- [Observability](./observability.md): Hook into the request lifecycle for logging and metrics.
