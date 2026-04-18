# Core Concepts

`@pureq/db` is built on two foundational principles: **Native-First** and **Validation-First**.

## Native-First

Unlike traditional ORMs that add multiple layers of abstraction, `@pureq/db` communicates as directly as possible with database drivers. Our Query Builder compiles directly to optimized SQL, giving you full control over the generated queries while maintaining 100% type safety.

## Validation-First

In the Pureq ecosystem, the schema is the single source of truth. A single definition in `@pureq/db` drives:

1. **Database Schema**: The structure of your tables.
2. **TypeScript Types**: Automatic inference of Select and Insert types.
3. **Validation**: Automatic generation of `@pureq/validation` schemas.
4. **Security Policies**: PII and access control rules that "push down" into the query layer.

## Architecture Overview

The package is divided into several key layers:

- **DSL**: The language used to define tables and columns.
- **AST & Compiler**: The engine that turns method chains into SQL.
- **Drivers**: The bridge to specific database engines (PostgreSQL, SQLite, etc.).
- **Validation Bridge**: The logic that connects DB schemas to the validation layer.
- **Migration Manager**: The tool for versioning and applying schema changes.
