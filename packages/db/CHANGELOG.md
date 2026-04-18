# Changelog

All notable changes to `@pureq/db` are documented in this file.

## [0.1.0]

### Added (0.1.0)

- Initial release of the Edge-Native Database Engine.
- **Pureq Native Engine**: Zero-dependency, Pure TypeScript Postgres and MySQL drivers with full binary protocol support.
- **Hardened Security**: Wire-level enforcement of Extended Query Protocols (Parse/Bind/Execute) making SQL Injection practically impossible.
- **Validation Bridge**: Seamless integration with `@pureq/validation` using `toValidationSchema(table)`.
- **Policy Pushdown**: Direct column-level security policies (e.g., `pii: true`) that propagate through the entire stack.
- **Universal Portability**: Native support for Cloudflare Workers, Vercel Edge, Bun, Deno, and Browser (via proxy).
- AST-based Type-Safe Query Builder for SELECT, INSERT, UPDATE, and DELETE.
- Transaction support with automatic rollback on failure.
- Detailed error parsing (SQLSTATE, constraints, etc.) for both Postgres and MySQL.
