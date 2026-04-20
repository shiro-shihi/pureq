# Changelog

All notable changes to `@pureq/pureq` are documented in this file.

## [1.2.0] - 2026-04-20

### Fortress Hardening Suite (Utility Update)

- **Timing-Safe Comparison:** Hardened `timingSafeEqual` to perform full bitwise comparison without early returns, effectively mitigating length-leakage timing attacks.
- **Robust Random ID Generation:** Improved `generateSecureId` to handle non-numeric inputs gracefully and ensure 100% adherence to numeric byte length requirements.

## [1.1.13]

### Changed (1.1.13)

- Enabled `composite: true` in `tsconfig.json` to support TypeScript Project References.
- Switched `typecheck` script to use `tsc --build` for improved monorepo dependency tracking.

## [1.1.12]

### Added (1.1.12)

- Performance and resilience improvements for the transport core.
