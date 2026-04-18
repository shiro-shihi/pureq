# `@pureq/db` Implementation Plan

## 1. Overview

The `@pureq/db` package is designed to provide a robust, type-safe, and performant database access and integration layer for the Pureq ecosystem. The primary focus is a **Native First** approach, providing a custom DB driver and query builder from the ground up to maximize type safety and performance, while still maintaining support for external ORMs (like Prisma).  

**Key differentiator**: The schema is the single source of truth. It powers not only database operations but also **seamless, zero-duplication integration with `@pureq/validation`** — automatically generating policy-aware validation schemas, PII/redaction rules, and safe serialization for the entire Pureq stack.

It aims to streamline data interactions between Pureq's fetching/mutation capabilities, backend database systems, **and the validation/policy layer**.
**Edge-Ready Architecture**: Supports both TCP-based native drivers and HTTP-based Data APIs (Neon, Cloudflare D1, etc.) to ensure compatibility with modern edge runtimes.

## 2. Goals & Scope

- **Native DB Driver**: Build a custom database driver and query builder tailored for the Pureq ecosystem.
- **Type Safety**: End-to-end type safety from the database schema to the application logic, driven by a powerful type inference engine (shared with `@pureq/validation`).
- **Ecosystem Integration**: Seamless integration with the broader `@pureq` toolkit — especially `@pureq/validation` (policies, input validation, safe `stringify`), observability, and caching.
- **Extensibility**: A flexible adapter-based architecture that natively supports multiple SQL databases (PostgreSQL, MySQL, SQLite, etc.) and provides compatibility layers for popular ORMs (Prisma, Drizzle, Kysely).
- **Validation-First Schema**: One schema definition → DB types + validation schema + policies (PII, scope, redact) + safe output.
- **Performance**: Efficient connection pooling, fast native query execution, and minimal overhead.
- **Policy Push-down**: Optimize performance and security by filtering unauthorized columns and rows at the SQL generation level based on `@pureq/validation` policies.
- **Traceable Operations**: Native integration with `@pureq` observability for tracking policy application and query performance.

## 3. Package Structure

```text
packages/db/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts
│   ├── core/           # Core interfaces and base classes
│   ├── drivers/        # Native (pg, sqlite) and Edge/HTTP drivers (D1, Neon, PlanetScale)
│   ├── schema/         # Schema DSL, type inference engine, and validation bridge
│   │   ├── index.ts
│   │   ├── dsl.ts      # table(), column.*()
│   │   ├── inference.ts
│   │   └── validation-bridge.ts  # toValidationSchema() + policy propagation
│   ├── builder/        # Native query builder and AST compiler
│   ├── transaction/    # Transaction management logic
│   ├── types/          # Global type definitions (shared with validation)
│   └── utils/          # Shared utilities and error formatting
├── tests/
│   ├── integration/    # Real DB tests (via Docker/Testcontainers)
│   └── unit/           # Isolated unit tests
└── docs/               # Package documentation
```

## 4. Core Architecture

- **Native Query Builder**: A custom AST-based query builder that compiles method chains into optimized SQL for specific database dialects.
- **Schema DSL**: A 100% TypeScript schema definition layer (`table('users', { ... })`) that serves as the **single source of truth**. It powers:
  - End-to-end type inference (`Insert<T>`, `Select<T>`)
  - Automatic generation of `@pureq/validation` schemas with full policy support (PII, scope, redact, etc.)
  - Column/Row-level policies that flow into SQL generation (Push-down) and safe serialization.
- **Validation Bridge**: `toValidationSchema(table)` that converts the DB schema into a fully-featured `@pureq/validation` schema in one line. Policies defined on columns are automatically inherited.
- **Driver Adapters**: Low-level adapters communicating directly with libraries like `pg` or `better-sqlite3`, bypassing intermediate ORMs for maximum control and performance.
- **Unified Result Normalization**: Catching database-specific error codes and data type differences (e.g., Date, JSON) and normalizing them to standard `@pureq` formats. Safe `stringify()` via validation is applied automatically on query results when policies are present.
- **Observability Integration**: Automatic OpenTelemetry (OTEL) instrumentation for query execution and `policyTrace` integration to log why specific fields were redacted or filtered.
- **Error Handling Strategy**: Standardize connection, timeout, constraint, and query errors from **Driver Adapters** into a normalized error surface via **Unified Result Normalization**. Include retry classification (transient/permanent), user-safe messages, and machine-readable error codes for observability.
- **Connection Pooling**: Define pool sizing defaults/min-max bounds, idle and max-lifetime eviction, graceful shutdown behavior, and health-check hooks in **Driver Adapters**. Expose lifecycle hooks so the **Native Query Builder** can fail fast when pool health is degraded.
- **Security**: Enforce prepared statements by default in the **Native Query Builder**, validate/sanitize dynamic identifiers through **Schema DSL** constraints, and document SQL injection mitigation points (parameter binding, identifier allow-lists, and schema-driven query generation). Keep `toValidationSchema` aligned with input policy checks to prevent unsafe value propagation.
- **Transaction Management**: Add explicit transaction API rules (supported isolation levels, rollback semantics, and nested/savepoint behavior). Integrate transaction context across **Driver Adapters** and **Native Query Builder** so multi-step schema/data operations can be executed atomically.

## 5. Implementation Phases (The "Native First + Validation-First" Roadmap)

### Phase 1: The Schema & Type Engine (Completed)

- [x] **Schema DSL Implementation**: Build a schema definition layer entirely in TypeScript, e.g. `table('users', { id: column.uuid().primary().policy({ pii: true }), ... })`.
- [x] **Validation Bridge**: Implement `toValidationSchema(table)` (and reverse) so that one schema definition instantly gives you a policy-aware `@pureq/validation` schema.
- [x] **Type Inference Magic**: Complete the type puzzles to automatically derive:
  - `Insert<T>`, `Select<T>` (DB)
  - `Infer<typeof validationSchema>` (validation)
  - Policy-aware types (scoped/redacted views)
- [x] **Edge Driver Core**: Define common interface for HTTP-based database drivers.

### Phase 2: The Native Query Builder (Completed)

- [x] **AST Compiler**: Develop an engine that parses method chains (`.select().where()`) and converts them into SQL for each database dialect.
- [x] **Relations & Joins**: Query generation logic that resolves 1:N and M:N relationships (Core logic implemented, basic joins/relations planned).
- [x] **Validation-Aware Queries**: Optional `.validate()` / `.sanitize()` chain methods that automatically run input validation and output sanitization using the generated validation schema.
- [ ] **Policy Compiler**: Logic to "push down" `@pureq/validation` policies into `WHERE` clauses and `SELECT` field lists. (Base structure ready).

### Phase 3: Driver Integration & Connection (In Progress)

- [x] **Pureq Native Drivers**: Implement adapters that communicate directly with low-level libraries like `pg` and `better-sqlite3`.
- [ ] **Pureq Edge Adapters**: Implement HTTP-based adapters for Cloudflare D1, Neon HTTP, and PlanetScale.
- [x] **Unified Result Normalization + Safe Output**: Normalize database-specific data types **and** automatically apply `@pureq/validation` `stringify()` (via `.validate()`).
- [ ] **Observability Hookup**: Integrate with `@pureq` observability for OTEL tracing and performance metrics.

### Phase 4: Reliability & Tooling (In Progress)

- [x] **Integration Test Suite**: Rigorous query testing (Mock-based and SQLite in-memory integration).
- [ ] **Migration Preview**: A simulator feature that compares the current schema with the database state.
- [x] **Migration Execution**: Execute DDL/DML migrations in deterministic order with transactional wrapping.
- [ ] **Data Migrations**: Support transform scripts or migration functions.
- [ ] **Migration Rollback**: Support reversible migrations.
- [x] **Schema Versioning**: Track applied migrations in a migrations table.
- [ ] **Schema Validation CLI**: `pureq db validate` that checks both DB schema consistency **and** validation policy coverage.
- [ ] **Dogfooding**: Migrate `packages/auth` SQL adapters to use `@pureq/db`.

## 6. Testing Strategy

- **Unit Tests**: Focus on AST compilation, query string generation, schema DSL validation, **validation bridge**, and type inference without requiring a live database.
- **Integration Tests**: Crucial for verifying the actual behavior of native drivers **and** end-to-end validation → DB → safe output round-trips. Will utilize Docker/Testcontainers.
- **Type Tests**: Use TypeScript to rigorously test generic constraints and ensure invalid queries, schema definitions, **or policy mismatches** are caught at compile time.
- **Validation-Specific Tests**: Test policy inheritance, redaction/masking behavior, and scope-based serialization using `@pureq/validation` APIs.
