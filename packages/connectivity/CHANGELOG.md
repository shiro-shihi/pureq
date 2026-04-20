# Changelog

All notable changes to `@pureq/connectivity` are documented in this file.

## [1.0.0] - 2026-04-20

### Fortress Edition - Universal Stream Core

This is the first stable release of `@pureq/connectivity`, providing high-performance, universal TCP and Web Stream connectivity.

### Core Features

- **Universal Connector:** Unified TCP socket support for Node.js, Bun, Deno, and Cloudflare Workers.
- **O(1) StreamReader:** Efficient chunk-queueing strategy (`Uint8Array[]`) that prevents O(N^2) buffer reallocation performance spikes.
- **Zero-Dependency:** 100% standard Web Stream API usage.

### Added (Security Hardening)

- **Hardened TLS:** Strict `secureTransport` enforcement for Cloudflare Workers.
- **Unified SSL Validation:** Consistent `rejectUnauthorized` handling across all supported runtimes to prevent MITM attacks.
