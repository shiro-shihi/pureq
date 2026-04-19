# @pureq/db v1.0.0

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

Processing raw binary database rows into JavaScript accessors.

| Scenario | Legacy Eager Parsing | **@pureq/db Hybrid** | Improvement |
| :--- | :--- | :--- | :--- |
| **Postgres (3 cols)** | 2.21 µs/row | **1.33 µs/row** | **1.6x Faster** |
| **Postgres (20 cols)** | 16.46 µs/row | **2.11 µs/row** | **7.8x Faster** |
| **MySQL (20 cols)** | 7.98 µs/row | **2.68 µs/row** | **3.0x Faster** |

*Benchmarks conducted on Node.js 24.11.0, 11th Gen Intel Core i7-11700F @ 2.50GHz. Note: Performance may vary based on environment and network conditions.*

---

## The Pureq Native Advantage

| Feature | @pureq/db Native | Legacy Drivers (pg/mysql2) |
| :--- | :--- | :--- |
| **Security** | **Zero-Trust (AST Signatures)** | Vulnerable to raw string injection |
| **Batching** | **Zero-Roundtrip Pipelining** | Sequential (Latency heavy) |
| **Memory** | **Constant O(1) via LazyRow** | High (Eager object allocation) |
| **Portability** | **Universal (Edge, Browser, Node)** | Node.js centric |
| **Testing** | **Virtual DB (Record/Replay)** | Requires Docker/Database |
| **Dependencies** | **0 Dependencies (Pure TS)** | Large C++/JS dependency trees |

---

## Game-Changing Features

### Zero-Roundtrip Pipelining

@pureq/db allows sending multiple messages (Parse, Bind, Execute) in a single TCP packet. This enables complex operations to complete in exactly one network round-trip, drastically reducing the "latency tax" in Edge-to-Cloud connections.

### Hybrid & Lazy Decoding

Traditional drivers parse every column into JavaScript objects immediately. @pureq/db uses a hybrid engine:

- **Eager mode:** Optimized for small result sets.
- **Lazy mode (Proxy-based):** Automatically activated for wider rows. It holds the raw binary buffer and only decodes a specific column when you access it (e.g., `row.name`), reducing GC pressure by 90%+.

### Zero-Trust Execution

When enabled, the driver refuses to execute any SQL string that does not carry a cryptographic signature from the Pureq Query Builder. This protocol-level protection makes SQL injection impossible, providing a true zero-trust foundation.

### Virtual Database

Record database interactions into a snapshot and replay them in CI/CD. The driver acts as a virtual database server at the protocol level. No Docker or real database required for tests.

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
