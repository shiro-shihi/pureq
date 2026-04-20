# Architecture Overview: The Sealed Data Bridge

`@pureq/rpc` is not a traditional RPC framework. It is an **Industrial-Grade Data Bridge** designed to move information between a database and a User Interface with absolute integrity and minimum overhead.

## The Problem with Traditional RPC

Frameworks like tRPC or GraphQL rely on "Application Layer Security." They parse JSON into objects, perform validation, and then execute logic. This leaves several gaps:

1. **JSON Tax:** Stringifying and parsing JSON is CPU-intensive and creates massive GC pressure.
2. **Open Endpoints:** Any client can attempt to call any endpoint with any payload.
3. **Data Leaks:** Developers must remember to manually `omit()` sensitive fields like `password_hash`.

## The Pureq Solution: Absolute Security by Construction

Pureq RPC solves these problems by moving security and performance down to the **Protocol Level**.

### 1. The Manifest Engine (Static Lockdown)

We eliminate "Open Endpoints" by using a **Query Manifest**. Every database query used in your application is frozen at build time (via `defineManifest`).

- The client sends a `QueryId` (a stable hash).
- The server only executes queries registered in the manifest.
- Arbitrary code execution or SQL injection is physically impossible.

### 2. The Binary Bridge (Zero-Allocation Transcoding)

Instead of converting DB data to JSON, we use the **Bitwise Transcoder**.

- It reads raw DB binary (PostgreSQL/MySQL).
- It copies only the whitelisted bytes directly into a Pureq RPC binary buffer.
- This process is O(1) in terms of memory pressure and avoids the JS Object boundary.

### 3. Identity-Bound Transport (Anti-BOLA)

Every request is cryptographically bound to the user's session.

- **HMAC Signatures:** `HMAC(SessionSecret, QueryId + Params)`.
- If a signature is invalid or belongs to another user, the request is dropped in **Constant-Time** at the network boundary.

---

By combining these three layers, Pureq RPC creates a "Sealed Pipe" where only authorized data can flow, at speeds that traditional JSON-based systems cannot match.
