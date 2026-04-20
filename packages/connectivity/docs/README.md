# @pureq/connectivity

The universal communication heart of the Pureq framework.

## Overview
This package provides a 100% zero-dependency, platform-agnostic I/O layer built entirely on the **Web Streams API**. It abstracts away the differences between Node.js TCP sockets, Cloudflare Workers' `connect()`, and other runtime-specific networking APIs.

## Key Features
- **Zero-Dependency:** No reliance on `node:net` or other platform-specific modules at the type or runtime level.
- **Universal:** Supports Node.js, Bun, Deno, and Cloudflare Workers out of the box.
- **Web-Stream Based:** Uses `ReadableStream` and `WritableStream` as the primary primitives.
- **Slab-Aware:** Designed to work with Pureq's zero-allocation memory philosophy.

## Contents
- [Architecture & Design](./architecture.md) - How we bridge platform sockets to Web Streams.
- [Platform Support](./platform_support.md) - Specifics on how Node, Bun, Deno, and CFW are handled.
- [API Reference](./api_reference.md) - Guide to `PureqConnection`, `Reader`, and `Writer`.
