# @pureq/rpc v1.0.0

**The Zero-Dependency, Manifest-Driven Secure Data Bridge for TypeScript.**

@pureq/rpc is an industrial-grade transport layer designed to move data between databases and UIs with absolute integrity and minimum overhead. It is the core of the Pureq full-stack framework.

---

## Why Pureq RPC?

Traditional RPC frameworks (tRPC, GraphQL) rely on application-layer logic for security and JSON for communication. Pureq moves these responsibilities to the **Protocol Layer**.

- **Absolute Security:** Structural prevention of SQLi, BOLA, and Data Leaks via "Physical Masking."
- **Extreme Performance:** 3x - 10x faster decoding than JSON-based systems using the Bitwise Hyper-Codec.
- **Universal Runtime:** 100% Zero-Dependency. Built on Web Standard APIs (Fetch, Crypto, Streams). No Node.js required.

---

## Technical Highlights

### 1. Sealed Manifest (Build-less Lockdown)

Queries are frozen at the type level. Any attempt to use dynamic query generation is caught by the TypeScript compiler. No CLI or build tools needed.

### 2. Physical Masking

Sensitive columns (e.g., `password_hash`) are physically skipped during DB-to-RPC transcoding. They never exist on the network wire.

### 3. Identity-Bound HMAC

Every request is mathematically bound to the active user's session. Captured packets cannot be replayed or spoofed by other users.

---

## Documentation

Detailed guides are available in the [docs](./docs) directory:

- [Architecture Overview](./docs/architecture_overview.md)
- [Getting Started](./docs/getting_started.md)
- [Binary Protocol Spec](./docs/binary_protocol_spec.md)
- [Data Isolation & Transcoding](./docs/data_isolation_and_transcoding.md)
- [Advanced Caching (Result Pinning)](./docs/advanced_caching.md)

---

## License

MIT
