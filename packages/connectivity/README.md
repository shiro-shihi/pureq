# @pureq/connectivity v0.1.0

**The Universal Web-Stream-Based Communication Heart for Pureq.**

@pureq/connectivity is a 100% zero-dependency, platform-agnostic I/O layer. It serves as the foundation for all Pureq networking, from database drivers to secure RPC transport.

---

## Why Connectivity?

Networking APIs are fragmented across different runtimes (Node.js `net`, Bun `Bun.connect`, Cloudflare `connect()`). Pureq Connectivity abstracts these differences into a single, high-performance interface based on the **Web Streams API**.

- **True Zero-Dependency:** No reliance on `node:*` modules or any external libraries.
- **Universal Runtime:** One codebase for Browser, Cloudflare Workers, Bun, Deno, and Node.js.
- **Web-Stream Native:** Built on `ReadableStream` and `WritableStream` for native back-pressure and efficiency.
- **Slab-Aware:** Designed to support Pureq's zero-allocation memory philosophy.

---

## Core Architecture

Instead of reinventing the wheel, Connectivity "shims" platform-specific TCP/TLS APIs into standard Web Streams.

```typescript
import { PureqConnection } from "@pureq/connectivity";

// One API to rule them all
const conn = await PureqConnection.connect({
  host: "localhost",
  port: 5432
});

// High-level async reading
const header = await conn.reader.read(5);
const body = await conn.reader.read(header[4]);

// Direct writing
await conn.writer.write(new Uint8Array([0x01, 0x02]));
```

---

## Documentation

Detailed technical guides are available in the [docs](./docs) directory:

- [Architecture & Design](./docs/architecture.md)
- [Platform Support Matrix](./docs/platform_support.md)
- [API Reference](./docs/api_reference.md)

---

## Supported Runtimes

- **Node.js 18+** (via self-implemented Stream Bridge)
- **Bun** (Native integration)
- **Deno** (Native integration)
- **Cloudflare Workers** (via TCP Socket API)

---

## License

MIT
