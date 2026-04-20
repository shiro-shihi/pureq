# Connectivity Architecture: The Stream Bridge

Pureq Connectivity acts as a unified adapter layer. Instead of database drivers or RPC handlers knowing how to open a TCP socket, they simply ask for a `PureqConnection`.

## The Core Abstraction
We define a universal `PureqIO` interface:
```typescript
interface PureqIO {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
}
```

## Internal State Machine
1. **The Connector:** Detects the environment (Node, Bun, Deno, etc.) and uses the most efficient native API to open a connection.
2. **The Shim:** Converts the native socket into a standard `ReadableStream` and `WritableStream`.
3. **The Controller:** Provides `PureqStreamReader` and `PureqStreamWriter` which add high-level features like `read(n)` (exact byte matching) and `peek()` without losing the benefits of Web Stream back-pressure.

## Zero-Dependency Enforcement
By using dynamic `import()` calls inside the `connect()` method, the package prevents Node.js types and modules from being bundled or required in non-Node environments like the browser or Cloudflare Workers.
