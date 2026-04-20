# Platform Support Matrix

Pureq Connectivity is tested and optimized for the following runtimes:

### Node.js (18+)
- **Implementation:** Wraps `node:net` and `node:tls`.
- **Conversion:** Uses a custom `ReadableStream` controller to enqueue data from the `data` event of `net.Socket`.

### Bun
- **Implementation:** Uses the high-performance `Bun.connect` API.
- **Conversion:** Bun's socket objects natively expose `.readable` and `.writable` properties.

### Deno
- **Implementation:** Uses `Deno.connect`.
- **Conversion:** Native support for Web Streams.

### Cloudflare Workers
- **Implementation:** Uses the `cloudflare:sockets` module.
- **Conversion:** Built-in support for `ReadableStream` and `WritableStream`.

---

### Browser Environment
Direct TCP connections are not supported in standard browsers. For browser-to-DB connectivity, a Proxy or a WebSocket-to-TCP bridge is required. Pureq RPC is the recommended way to move data to the browser.
