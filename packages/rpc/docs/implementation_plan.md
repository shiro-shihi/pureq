# @pureq/rpc - Implementation Plan (Build-less Fortress)

## 1. Vision: Zero-Dependency, Zero-Tooling, Absolute Integrity

`@pureq/rpc` is a build-less, dependency-free data transport engine. It eliminates the need for CLI tools, file system access, and external parsers. Security is enforced through **Advanced TypeScript Type Constraints** and a high-performance, universal runtime.

## 2. The "No-Node" Mandate

- **Runtime:** 100% Universal. Works in any WinterCG environment (Browser, Cloudflare Workers, Node.js, Bun, Deno).
- **Tooling:** No CLI. No `fs`, `path`, or `process`.
- **Dependencies:** **TRUE ZERO.** No external packages allowed.

## 3. The Security Pillars

### A. Type-Locked Manifest (Static Enforcement)

- Instead of a CLI scanner, users define their queries in a `defineManifest` helper.
- The `defineManifest` type uses **Template Literal Types** and **Mapped Types** to ensure that only static, literal query structures are accepted.
- Any attempt to use dynamic variables in the manifest will result in a **TypeScript Compiler Error**.

### B. Identity-Bound HMAC Integrity

- **Signature:** `HMAC-SHA256(SessionToken, QueryId + Params)`.
- **Encryption:** Rely on native TLS (HTTPS). No redundant AES-GCM at the RPC layer to ensure maximum performance.

### C. Physical Masking (Transcoding)

- The server uses the manifest object to perform bitwise transcoding.
- Only fields explicitly defined in the manifest's query are copied to the RPC response buffer.

## 4. Performance Pipelining

- **Zero-Allocation Slab Codec:** Reusable memory slabs to minimize GC pressure.
- **Bitwise Transcoder:** Direct DB-to-RPC binary conversion.

---

## 5. Detailed Roadmap

### Phase 1: The Type-Locked Manifest Engine

- Implement `defineManifest` with strict type constraints.
- Create the core `QueryRegistry` that holds these definitions at runtime.

### Phase 2: Lean Universal Runtime (Shared)

- Implement `runtime/shared/crypto` with HMAC-only signatures using `globalThis.crypto.subtle`.
- Develop `PureqHyperCodec` with slab allocation for binary serialization.

### Phase 3: Binary Transcoder (Server)

- Implement the bitwise mapping logic that uses the runtime manifest to "mask" and "transcode" DB rows.

### Phase 4: Sealed Proxy (Client)

- Implement the client proxy that consumes the `AppRouter` type for 100% type-safe, authenticated binary calls.
