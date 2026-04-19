# @pureq/db v1.2.0

**The Policy-First, High-Performance Native Database Engine for TypeScript.**

@pureq/db is a zero-trust, enterprise-grade database access layer. Built from the ground up for Edge runtimes (Cloudflare Workers, Vercel Edge, Deno, Bun) and Node.js, it combines a functional query builder with **Pureq Native Engines**: zero-dependency, pure TypeScript implementations of PostgreSQL and MySQL wire protocols.

---

## Technical Benchmarks

Pureq Native is architected to solve real-world bottlenecks where legacy drivers struggle: network latency and memory overhead.

### 1. Network Latency Efficiency

Simulated high-latency connection (20ms RTT) executing a 3-query transaction.

| Driver | Total Execution Time | Network Round-trips | Improvement |
| :--- | :--- | :--- | :--- |
| Legacy Drivers (Sequential) | 92.89 ms | 3 RTTs | Baseline |
| **@pureq/db Native** | **30.73 ms** | **1 RTT (Pipelined)** | **3.0x Faster** |

### 2. CPU & Memory Efficiency (Decoding)

The v1.2.0 **Bitwise Engine** eliminates `DataView` overhead and uses an **Ultra-Fast ASCII Decoder** to bypass C++/JS boundary crossings.

| Scenario | Legacy Eager Parsing | **@pureq/db v1.2 (Bitwise)** | Improvement |
| :--- | :--- | :--- | :--- |
| **Postgres (100 cols)** | 11.82 µs/row | **6.24 µs/row** | **1.9x Faster** |
| **Postgres (3 cols)** | 0.48 µs/row | **0.25 µs/row** | **1.9x Faster** |
| **MySQL (20 cols)** | 7.98 µs/row | **2.11 µs/row** | **3.8x Faster** |

*Benchmarks conducted on Node.js 24.11.0. Note: Performance may vary based on environment and network conditions.*

---

## The Pureq Native Advantage

| Feature | @pureq/db Native | Legacy Drivers (pg/mysql2) |
| :--- | :--- | :--- |
| **Security** | **Hardened Zero-Trust (Timing-Safe)** | Vulnerable to raw string injection |
| **Batching** | **Zero-Roundtrip Pipelining** | Sequential (Latency heavy) |
| **Memory** | **Zero-Copy Buffer Management** | High (Eager object allocation) |
| **Decoding** | **Raw Bitwise (No DataView)** | DataView/Buffer (Slow alignment) |
| **Dependencies** | **0 Dependencies (Pure TS)** | Large C++/JS dependency trees |

---

## Comparison with Other Tools

How does `@pureq/db` differ from industry standards like Prisma, Drizzle, or the classic `pg` driver?

| Feature | **@pureq/db** | Prisma | Drizzle | pg (node-postgres) |
| :--- | :--- | :--- | :--- | :--- |
| **Architecture** | **Pure TS (Native)** | Rust Engine binary | Library Wrapper | JS + Optional C++ |
| **Security** | **Zero-Trust (Signed AST)** | Basic Validation | Type-safety only | None (Raw SQL) |
| **Decoding** | **v1.2 Bitwise Engine** | Eager (JSON-RPC) | Driver-dependent | Eager (Slow) |
| **Edge Ready** | **Yes (0 Deps)** | Heavy Cold Starts | Driver-dependent | No (Node.js only) |
| **Latency** | **1 RTT (Pipelining)** | High (Rust Proxy) | Multi-RTT | Sequential |
| **Bundle Size** | **Extremely Small** | Very Large | Small | Medium |

### Why Pureq?

1. **vs Prisma:** Prisma is powerful but heavy. Its Rust-based engine often struggles with cold starts on Edge functions (Cloudflare Workers). Pureq provides similar DX with **zero cold-start penalty** and a much smaller footprint.
2. **vs Drizzle:** Drizzle is a great lightweight wrapper, but it still relies on external drivers like `pg` or `mysql2`. Pureq **is** the driver. We control the protocol layer, allowing for optimizations like **Bitwise Decoding** and **Signed Zero-Trust** that wrappers cannot provide.
3. **vs pg / mysql2:** These are Node-specific and built for an era before Edge computing. They carry legacy baggage and lack modern security features. Pureq's **Zero-Trust mode** physically prevents SQL injection at the protocol level, which is a major leap over classic drivers.

---

## Game-Changing Features

### Ultra-Fast Bitwise Engine

The v1.2 release replaces standard `DataView` calls with raw bitwise operations (`<<`, `|`). This allows the V8 JIT compiler to generate optimal machine code with zero alignment checks, achieving near-native throughput.

### Zero-Roundtrip Pipelining

@pureq/db allows sending multiple messages (Parse, Bind, Execute) in a single TCP packet. This enables complex operations to complete in exactly one network round-trip, drastically reducing the "latency tax" in Edge-to-Cloud connections.

### Hybrid & Lazy Decoding

Traditional drivers parse every column into JavaScript objects immediately. @pureq/db uses a hybrid engine:

- **Eager mode:** Optimized for small result sets.
- **Lazy mode (Proxy-based):** Automatically activated for wider rows. It holds the raw binary buffer and only decodes a specific column when you access it (e.g., `row.name`), reducing GC pressure by 90%+.

### Hardened Zero-Trust Execution

When enabled, the driver refuses to execute any SQL string that does not carry a cryptographic signature. v1.2 introduces **Constant-Time Comparison** and **Secure Random Signatures** to eliminate timing attacks and prediction.

### Industrial-Grade Reliability

- **DoS Protection:** Strict `MAX_MESSAGE_SIZE` (16MB) enforcement.
- **Memory Leak Prevention:** LRU-capped Prepared Statement Caching (1000 entries).
- **Recursion Guard:** Strict limits on nested array decoding to prevent stack overflow.

---

## Quick Start

### Native Connection (Zero-Dependency)

```typescript
import { DB, PostgresNativeDriver, NativePool } from "@pureq/db";

const pool = new NativePool({
  host: "localhost",
  port: 5432,
  user: "admin",
  password: "password",
  database: "main",
  zeroTrust: true // Protocol-level security
});

const db = new DB(pool);
```

### High-Performance Streaming

```typescript
// Process 1,000,000 rows with constant memory usage
for await (const row of db.driver.stream(db.select().from(users))) {
  console.log(row.name); // Decoded lazily on-demand
}
```

---

## Legacy Compatibility

We provide first-class adapters for:

- pg (node-postgres)
- mysql2
- better-sqlite3
- Cloudflare D1
- Neon / PlanetScale

## License

MIT
