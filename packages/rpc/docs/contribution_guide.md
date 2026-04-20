# Contribution Guide: Extending the Fortress

Thank you for your interest in contributing to `@pureq/rpc`. As an industrial-grade, zero-dependency framework, we have high standards for code quality, security, and performance.

## 1. The "Zero" Mandate

Before submitting a PR, ensure your changes adhere to our core mandates:
1. **Zero External Dependencies:** No runtime libraries.
2. **Zero Node.js Modules:** All runtime code must use Web Standard APIs.
3. **Zero Security Regression:** Any new feature must be compatible with **Physical Masking** and **HMAC Integrity**.

## 2. Development Setup

```bash
# Clone the repository
git clone https://github.com/pureq/pureq.git

# Install workspace dependencies
pnpm install

# Build all packages
pnpm build
```

## 3. Adding Support for New Types (OIDs)

If you need to support a new database data type (e.g., PostgreSQL `UUID` or `NUMERIC`), you need to update two files:

1. **`runtime/shared/types.ts`:** Add a new `TYPE_ID`.
2. **`runtime/server/transcoder.ts`:** Add a new `switch` case in `transcodePgValue` or `transcodeMysqlValue` to perform the bitwise copy.

## 4. Testing Requirements

Every new feature or bug fix must include:
1. **Unit Tests:** For individual components (`codec`, `crypto`).
2. **Security Assult Test:** Verify the change doesn't introduce BOLA or DoS vulnerabilities.
3. **Performance Baseline:** If the change affects the hot path, provide a benchmark comparison.

## 5. Coding Style
- **Bitwise over DataView:** Prefer raw bit-shifting for integer parsing.
- **Slab over Concat:** Do not use `Uint8Array.set` or `Array.push` for building buffers; use the provided `Slab`.
- **Async Hygiene:** Minimize microtasks. Use synchronous loops for bit-level processing.

---
Pureq is built on precision. We look forward to your contributions!
