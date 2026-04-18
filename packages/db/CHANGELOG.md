# Changelog

All notable changes to @pureq/db are documented in this file.

## [1.0.0] - The "Policy-First" Release

### Major Features

- **Ergonomic Relations & Eager Loading (.with())**: Introduced the ability to define relations (belongsTo, hasMany) directly in the schema DSL. The new .with() method automatically resolves JOINs and maps the flat SQL results into deeply nested, type-safe objects.
- **Universal Row-Level Security (RLS)**: The RLS engine is no longer planned—it's here. You can now define arbitrary, context-aware rls policy functions directly in TableOptions.
- **Improved RLS DX**: RLS policies now receive a set of expression helpers (eq, col, and, or, etc.) as the second argument, allowing for a clean and expressive syntax like `(ctx, { eq, col }) => eq(col("id"), ctx.orgId)`.
- **Safe JSONB Querying (.at())**: Added the .at(path) method to JSON columns. This provides a secure, injection-free way to query nested JSON data, automatically translating to dialect-specific operators (like ->> in PostgreSQL).

### Hardcore Security Hardening

- **Unicode Homograph Defense**: Implemented NFKC normalization and strict ASCII checking within validateIdentifier to prevent sophisticated bypass attacks using visually identical Unicode characters.
- **PostgreSQL 65k Limit Protection**: Added defensive checks against massive parameter arrays that could cause database crashes or silent failures, converting them into explicit Security Exceptions.
- **AST-Level DoS Protection**: Hardened the expression compiler against deeply recursive objects (circular references) and massively nested OR-chains, preventing CPU/Memory exhaustion during query generation.
- **Empty IN-Clause Safety**: Improved the generic compiler to safely convert empty IN () arrays to (1 = 0) and NOT IN () to (1 = 1), preventing database syntax errors on empty filters.

### Changes & Improvements

- **Structural Mapping**: The SelectBuilder now intelligently expands SELECT * across all joined tables and assigns __table__column aliases to prevent column name collisions during eager loading.
- **Policy Pushdown Enhancements**: applyPolicyPushdown now rigorously applies policies not just to the base table, but symmetrically across all joined tables to prevent shadowing bypasses.
- **Edge Runtime Support**: Explicitly documented and verified support for Cloudflare D1, libSQL, and other SQLite-based Edge drivers.

---

## [0.1.0]

### Added
- Initial release of the Edge-Native Database Engine.
- Pureq Native Engine: Zero-dependency, Pure TypeScript Postgres and MySQL drivers with full binary protocol support.
- Hardened Security: Wire-level enforcement of Extended Query Protocols (Parse/Bind/Execute) making SQL Injection practically impossible.
- Validation Bridge: Seamless integration with @pureq/validation using toValidationSchema(table).
- Policy Pushdown: Direct column-level security policies (e.g., pii: true) that propagate through the entire stack.
- Universal Portability: Native support for Cloudflare Workers, Vercel Edge, Bun, Deno, and Browser (via proxy).
- AST-based Type-Safe Query Builder for SELECT, INSERT, UPDATE, and DELETE.
- Transaction support with automatic rollback on failure.
- Detailed error parsing (SQLSTATE, constraints, etc.) for both Postgres and MySQL.
