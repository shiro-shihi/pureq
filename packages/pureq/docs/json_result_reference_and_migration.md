# JsonResult API Reference & Migration Guide

In pureq, we recommend the Result pattern for handling errors as values instead of relying on exceptions (`try/catch`).

Among those APIs, the JsonResult methods are used most frequently because they combine HTTP execution with automatic JSON parsing.

## 1. JsonResult Method Comparison

The JsonResult family differs by request style, argument count, and argument shape.

| Method | Number of arguments | Argument shape | HTTP method | Primary use case |
| --- | --- | --- | --- | --- |
| `getJsonResult` | 2 | `(url, options)` | `GET` | Read/fetch data |
| `postJsonResult` | 3 | `(url, body, options)` | `POST` | Create/send data |
| `requestJsonResult` | 1 | `(config)` | Optional (`config.method`) | Single-object config for advanced or dynamic requests |

### Argument Roles

- `url`: Request path. Can include path params such as `:id`.
- `body`: Data payload sent to the server (used for `POST`, etc.).
- `options`: Request options object such as `headers`, `params` (path params), `query` (query string), and `signal` (cancellation).
- `config`: Unified object that can include `url`, `method`, `body`, `headers`, and other request settings.

## 2. Migration Guide from fetch (Before / After)

This section compares the common `fetch` workflow (manual status checks and JSON parsing) with pureq's JsonResult workflow.

### Case A: Simple GET Request

Before: native `fetch`

```ts
try {
  const res = await fetch("http://localhost:3000/users/123");
  if (!res.ok) throw new Error("HTTP Error");
  const user = await res.json();
  console.log(user.name);
} catch (e) {
  console.error("Request failed", e);
}
```

After: pureq (`getJsonResult`)

```ts
const result = await client.getJsonResult<User>("/users/123");

if (result.ok) {
  // Here, result.data is strongly typed as User.
  console.log(result.data.name);
} else {
  // Errors are returned as values, so branching stays explicit.
  console.error("Request failed", result.error.message);
}
```

### Case B: POST Request with Authorization Header

Important point: for `postJsonResult`, the second argument is always the request body.

Before: native `fetch`

```ts
const res = await fetch("/users/:id", {
  method: "POST",
  body: JSON.stringify({ name: "Alice" }),
  headers: { Authorization: "Bearer <token>" },
});
```

After: pureq (`postJsonResult`)

```ts
const result = await client.postJsonResult<User>(
  "/users/:id",            // 1. URL
  { name: "Alice" },       // 2. Body (payload)
  {                          // 3. Options (request settings)
    params: { id: "123" },
    headers: { Authorization: "Bearer <token>" },
  },
);
```

### Case C: Keep All Settings in a Single Object

If you want a `fetch`-style single config object, use `requestJsonResult`.

After: pureq (`requestJsonResult`)

```ts
const result = await client.requestJsonResult<User>({
  url: "/users/:id",
  method: "POST",
  body: { name: "Alice" },
  params: { id: "123" },
  headers: { Authorization: "Bearer <token>" },
});
```
