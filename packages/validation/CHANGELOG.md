# Changelog

All notable changes to `@pureq/validation` are documented in this file.

## [0.2.0]

### Added (0.2.0)

- `NullableSchema` and `v.nullable()` support for explicit null handling in DB-integrated validation.
- `OptionalSchema` and `v.optional()` support for undefined handling.
- `GuardSchema` and `v.guard()` integration as a first-class `PolicySchema`.
- Support for callable guard schemas for flexible chaining.

### Fixed (0.2.0)

- Removed forbidden `throw` statements in `GuardSchema` to maintain zero-throw policy.

## [0.1.1]

### Added (0.1.1)

- Initial stable release with policy-aware validation.

## [0.1.0-draft]

### Added (0.1.0-draft)

- `Result<T, E>` core helpers with zero-throw validation flows.
- `ValidationError` canonical error codes and JSON Pointer paths.
- Primitive, composite, and policy-aware schemas.
- `v.guard(fn)`, `pipe`, and `pipeAsync` guardrail execution support.
- `stringify(data, schema, options?)` with redaction and scope-based output control.
- English-only documentation and source-comment policy checks for the validation package.
