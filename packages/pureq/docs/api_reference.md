# API Reference

This document provides a comprehensive reference for the core **pureq** public API.

## createClient(options)

Creates a new, immutable `PureqClient` instance.

```ts
import { createClient } from "@pureq/pureq";

const client = createClient({
  baseURL: "https://api.example.com",
  // ... extra options
});
```

### ClientOptions

| Option | Type | Description |
| --- | --- | --- |
| `baseURL` | `string` | Base URL for all requests. |
| `headers` | `Record<string, string>` | Default headers for all requests. |
| `middlewares` | `Middleware[]` | Array of middleware to apply in order. |
| `hooks` | `ObservabilityHooks` | Lifecycle hooks for monitoring. |
| `adapter` | `HttpAdapter` | Custom HTTP adapter (defaults to native `fetch`). |
| `bodySerializer` | `BodySerializer` | Custom logic for serializing request bodies. |
| `requestIdHeaderName` | `string` | Name of the header to inject request IDs (default: `x-request-id`). |
| `requestIdFactory` | `() => string` | Custom function to generate unique request IDs. |
| `traceContextProvider` | `() => TraceContext` | Function to provide OTel trace context (`traceparent`, etc.). |

---

## PureqClient Methods

All methods that modify configuration return a **new** client instance.

### Middleware & Interceptors

- `.use(middleware: Middleware)`: Adds a middleware to the stack.
- `.useRequestInterceptor(handler, options?)`: Adds a request interceptor.
- `.useResponseInterceptor(handler, options?)`: Adds a response interceptor.

### Request Methods

All request methods support **Type-safe Path Parameters**. If your URL includes `:paramName`, it must be provided in the `options.params` object.

| Type | Throwing | Non-throwing (Result API) | Description |
| --- | --- | --- | --- |
| **Generic** | `request(config)` | `requestResult(config)` | The most flexible request method. |
| **GET** | `get(url, opts)` | `getResult(url, opts)` | Standard GET request. |
| **POST** | `post(url, body, opts)` | `postResult(url, body, opts)` | Standard POST request. |
| **PUT** | `put(url, body, opts)` | `putResult(url, body, opts)` | Standard PUT request. |
| **PATCH** | `patch(url, body, opts)` | `patchResult(url, body, opts)` | Standard PATCH request. |
| **DELETE** | `delete(url, opts)` | `deleteResult(url, opts)` | Standard DELETE request. |

### JSON Helpers

These are high-level helpers that automatically parse the response body as JSON and check HTTP status.

| Type | Throwing | Non-throwing (Result API) |
| --- | --- | --- |
| **Generic** | `requestJson<T>(config)` | `requestJsonResult<T>(config)` |
| **GET** | `getJson<T>(url, opts)` | `getJsonResult<T>(url, opts)` |
| **POST** | `postJson<T>(body, opts)` | `postJsonResult<T>(body, opts)` |

---

## Request Options (RequestConfig)

Used in `getResult(url, options)`, `getJson(url, options)`, etc.

| Property | Type | Description |
| --- | --- | --- |
| `params` | `Record<string, string>` | Path parameters matching `:name` in the URL. |
| `query` | `Record<string, any>` | Query parameters to append to the URL. |
| `headers` | `Record<string, string>` | Additional headers for this specific request. |
| `body` | `any` | Request body. |
| `signal` | `AbortSignal` | Signal to cancel the request. |
| `timeout` | `number` | Timeout in milliseconds for this request. |
| `priority` | `number` | Priority for queues (e.g., offline queue). |

---

## Result API

Used by all `*Result` methods to prevent unhandled exceptions.

### Result<T, E>

- `ok: true`: Success. Data is in `result.data`.
- `ok: false`: Failure. Error details are in `result.error`.

### PureqError

- `kind`: Category of error (`network`, `timeout`, `http`, etc.).
- `code`: Machine-readable code (`PUREQ_TIMEOUT`).
- `message`: Descriptive message.
- `metadata`: Context like `method`, `url`, `status`.

---

## HttpResponse

A wrapper around the native `Response` object with added convenience.

- `status`: HTTP status code.
- `ok`: `true` if status is in the range 200-299.
- `headers`: `Record<string, string>`.
- `json<T>()`: Parses JSON body.
- `text()`: Parses text body.
- `blob()`: Parses binary blob.
- `arrayBuffer()`: Parses array buffer.
