# Changelog

All notable changes to @pureq/rpc are documented in this file.

## [1.1.0] - 2026-04-20

### Fortress Hardening Suite

- **DoS Mitigation:** Refactored `PureqHyperCodec` to support dynamic exponential buffer growth with a strict 128MB safety limit, eliminating the fixed per-request allocation vulnerability.
- **Side-Channel Hardening:** Updated `timingSafeEqual` to perform a full bitwise comparison across the entire length of the longest string, preventing length-leakage side channels.
- **Memory Efficiency:** Optimized `RpcHandler` to use small initial slabs, significantly reducing memory pressure in high-concurrency environments.

## [1.0.0] - 2026-04-20

### Fortress Edition - The Ultimate Data Bridge

This is the first stable release of `@pureq/rpc`, the foundational transport layer for the Pureq full-stack framework.

### Core Features

- **Sealed Manifest Engine:** 100% build-less static query enforcement at the type level. Prevents SQL injection and unauthorized query execution by design.
- **Hyper-Codec (v1.0):** Zero-allocation, bitwise binary serialization using reusable memory slabs. Optimized for V8 JIT and high-throughput Edge environments.
- **Binary Transcoder:** Direct database-to-browser binary conversion. Once DB packets hit the server, they are transcoded directly to RPC binary without intermediate JS object instantiation.
- **Physical Masking:** Structurally guarantees zero data leakage by physically skipping unrequested database columns at the byte level.
- **Identity-Bound Security:** Request integrity protected by HMAC-SHA256 signatures, mathematically binding every call to the user's session secret.
- **Universal Runtime:** 100% Zero-Dependency. Works on Browser, Cloudflare Workers, Bun, Deno, and Node.js using only Web Standard APIs.
- **Protocol-Level Caching:** Result Pinning support for 0ms latency responses via Edge KV or memory cache.

### Added

- `defineManifest` for static query definitions.
- `FortressRouter` and `RpcHandler` for secure server-side execution.
- `createPureqClient` for type-safe, authenticated binary communication.
- Comprehensive 15-part documentation suite.
- 10+ core unit and integration tests.
