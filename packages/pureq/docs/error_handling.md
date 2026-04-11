# Error Handling

Reliable applications must handle errors explicitly. **pureq** provides a robust error classification system and encourages the **Result Pattern** to ensure no error is ignored.

## The Result Pattern

Instead of using `try/catch` (which is often forgotten or catches more than intended), use the `*Result` methods: `getJsonResult`, `postJsonResult`, etc.

These methods return a object of type `Result<T, PureqError>`:

- `ok: true`: Success. Data is available in `result.data`.
- `ok: false`: Failure. Error details are available in `result.error`.

```ts
const result = await api.getJsonResult<User>("/users/:id", { params: { id: "42" } });

if (result.ok) {
  processUser(result.data);
} else {
  handleError(result.error);
}
```

## PureqError anatomy

All errors in `pureq` are instances of `PureqError`. They contain metadata to help you decide how to recover.

- `kind`: (string) A human-friendly categorization (e.g., `"network"`, `"timeout"`, `"http"`).
- `code`: (string) A machine-readable SCREAMING_SNAKE_CASE constant (e.g., `"PUREQ_TIMEOUT"`).
- `message`: (string) A descriptive error message.
- `metadata`: (object) Additional context (e.g., status code, headers, URL).

### Comprehensive Error Kinds

| Kind | Code | Description |
| --- | --- | --- |

| `network` | `PUREQ_NETWORK_ERROR` | Failed to connect to the server (DNS, offline). |
| `timeout` | `PUREQ_TIMEOUT` | The request exceeded the configured timeout. |
| `http` | `PUREQ_HTTP_ERROR` | The server responded with a non-2xx status code. |
| `circuit-open` | `PUREQ_CIRCUIT_OPEN` | The circuit breaker prevented the request. |
| `aborted` | `PUREQ_ABORTED` | The request was manually aborted. |
| `validation` | `PUREQ_VALIDATION_ERROR` | The response data failed schema validation. |
| `auth` | `PUREQ_AUTH_ERROR` | Auth refresh failed. |

## Exhaustive Handling

Because `PureqError` uses a discriminated union for its `kind`, you can use a `switch` statement to handle every possible error case. TypeScript will help you ensure you haven't missed any.

```ts
if (!result.ok) {
  switch (result.error.kind) {
    case "network":
      // Show "You are offline" banner
      break;
    case "timeout":
      // Suggest retrying or checking connection
      break;
    case "http":
      if (result.error.status === 404) {
        // Show "Not Found" page
      }
      break;
    case "circuit-open":
      // Show degraded mode UI
      break;
    // ... handle other cases
    default: {
      const exhaustiveCheck: never = result.error.kind;
      throw new Error(`Unhandled error kind: ${exhaustiveCheck}`);
    }
  }
}
```

## Throwing Errors

If you prefer to use `try/catch`, simply use the standard methods: `getJson`, `postJson`, etc. These will throw a `PureqError` on failure.

```ts
try {
  const user = await api.getJson<User>("/users/42");
} catch (err) {
  if (err instanceof PureqError) {
    console.error(err.code); // 'PUREQ_HTTP_ERROR'
  }
}
```
