# Pureq Ecosystem Strategy & Roadmap

This document outlines the architectural evolution of the Pureq ecosystem, moving from modular libraries to a unified, **Policy-First Full-stack Framework**.

---

## The Vision: The death of the double-write

The fundamental problem in modern full-stack development is the fragmentation of truth. Developers currently define data structures, validation rules, and authorization logic at least four times: in the database schema, the API validation layer, the manual authorization middleware, and the frontend types.

Pureq collapses these layers into a **Single Source of Truth (SSoT)**. By defining a schema once, security and integrity are enforced by construction across the entire stack.

---

## Architectural Core: Secure by Design

Unlike traditional frameworks where security is a "feature" added via middleware, Pureq treats security as a core architectural constraint.

### 1. Explicit Deny by Default

In the future `@pureq/server`, any resource or field without an explicitly defined policy is unreachable. Access control is not a checklist; it is the fundamental state of the routing engine. If a schema does not define who can see it, the framework returns a 403 Forbidden at the core level, before any business logic is executed.

### 2. Policy Push-down & AST Rewriting

Pureq does not rely on "filter-after-fetch" patterns which are prone to data leaks. Instead, it uses **AST (Abstract Syntax Tree) Rewriting** to inject security constraints directly into database queries and API responses. The framework ensures that unauthorized data never enters the application memory in an unredacted state.

---

## Roadmap: The Path to @pureq/server

### Phase 1: Policy-Aware RPC (@pureq/rpc)

Eliminating the manual controller.

- **Direct Schema Mapping:** Automatically generate secure, type-safe RPC endpoints from `@pureq/db` definitions.
- **Context Injection:** RPC handlers automatically inherit the authenticated `QueryContext` from `@pureq/auth`, ensuring RLS/CLS are applied at the database wire level without developer intervention.

### Phase 2: Zero-Trust Routing & Taint Tracking

- **Resource-Centric Routing:** Routes are mapped to schema resources. The router itself becomes policy-aware, validating authorization before the handler is even invoked.
- **Automatic Redaction:** Integrated taint tracking prevents "raw" database objects from being returned in HTTP responses. Data must pass through a "Policy Gate" which applies masking or hiding based on the requester's scopes.

### Phase 3: Redaction-Aware UI (@pureq/client)

- **Metadata-Driven UI:** The client-side library interprets schema metadata (e.g., `redact: "hide"`) to automatically handle unauthorized states in the UI (locking fields, showing skeletons, or triggering auth flows).
- **Universal Contract:** A single `@pureq/validation` contract governs both client-side form behavior and server-side integrity, eliminating drift between UI and API.

### Phase 4: Reactive Policy Engine (Real-time)

- **Filtered Streams:** Real-time data updates (WebSocket/SSE) are re-evaluated per-user. The engine filters or terminates streams immediately if a user's RLS permissions change mid-session.
- **Stateful Security:** Security is no longer a point-in-time check but a continuous property of the data stream.

---

## Strategic Position: Infrastructure Sovereignty

Pureq is built to be **Edge-Native and 0-dependency**. This is a strategic choice to ensure **Infrastructure Sovereignty**:

- **Vendor Neutrality:** Unlike frameworks locked into specific cloud providers or Rust-based engines requiring heavy proxies, Pureq runs anywhere Node.js, Deno, or Workers are supported.
- **Portable Security:** Your security policies move with your code. Whether you migrate from AWS to Cloudflare or from a Monolith to Microservices, the "Policy-First" guarantee remains intact.

**Conclusion:** Pureq is the absolute security boundary for the modern web. By making insecure code impossible to write, we allow developers to focus exclusively on their product, confident that the foundation is safe by design.
