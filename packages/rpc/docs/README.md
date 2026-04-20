# @pureq/rpc Documentation

Welcome to the documentation for the world's most secure and performant TypeScript RPC engine.

## Core Philosophy

`@pureq/rpc` is built on the principle of **"Absolute Security by Construction."** Unlike traditional RPC frameworks that rely on runtime validation alone, Pureq uses build-less static manifests and bitwise transcoding to make unauthorized data access physically impossible.

## Documentation Index

### Getting Started

- [Architecture Overview](./architecture_overview.md) - Understand the "Sealed Data Bridge" concept.
- [Getting Started Guide](./getting_started.md) - Your first 100% secure endpoint in 5 minutes.
- [Defining Manifests](./define_manifest.md) - How to lock down your queries at the type level.

### Security & Integrity

- [Identity-Bound Signatures](./security_hmac_signatures.md) - Preventing BOLA and Replay attacks.
- [Physical Masking](./physical_masking.md) - Why Pureq RPC cannot leak sensitive data.
- [Zero-Dependency Policy](./zero_dependency_policy.md) - Maintaining an ultra-pure runtime.

### Technical Deep Dives

- [Binary Protocol Specification](./binary_protocol_spec.md) - Details of the Hyper-Codec.
- [Bitwise Transcoder](./bitwise_transcoder.md) - DB-to-RPC binary magic.
- [Universal Runtime](./universal_runtime.md) - Running on Edge, Browser, and Node.js.

### Production & Performance

- [Error Handling](./error_handling.md) - Robust error normalization.
- [Performance Benchmarks](./performance_benchmarks.md) - Pureq vs tRPC vs Hono.
- [Deployment Guide](./deployment_guide.md) - Secret rotation and best practices.

---
@ 2026 Pureq Framework. Built for the modern Web.
