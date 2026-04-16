# @pureq/validation

`@pureq/validation` is a policy-aware validation and serialization layer for explicit data contracts.

It is built for codebases that need three things at the same time:

- structural validation without hidden exceptions
- policy metadata attached to the parsed value itself
- safe serialization with redaction and scope control

If you only want the shortest path, jump to [Quick Start](#quick-start). If you need the contract details, read [Core Concepts](#core-concepts) and [Advanced Usage](#advanced-usage).

## Install

```bash
npm install @pureq/validation
# or
pnpm add @pureq/validation
# or
yarn add dpureq/validation
```

## At a Glance

```ts
import { v } from "@pureq/validation";

const userSchema = v.object({
  id: v.string().uuid(),
  email: v.string().email(),
  profile: v.object({
    displayName: v.string(),
  }),
});

const result = userSchema.parse({
  id: "550e8400-e29b-41d4-a716-446655440000",
  email: "user@example.com",
  profile: { displayName: "Ada" },
});

if (result.ok) {
  console.log(result.value.data);
  console.log(result.value.policyMap);
}
```

## What This Package Gives You

- Primitive schemas for strings, numbers, and booleans.
- Composite schemas for nested objects and arrays.
- Policy inheritance and merging through `schema.policy(...)`.
- `ValidationResult` payloads with `metadata` and a JSON Pointer `policyMap`.
- Guard execution with `v.guard(...)`, `pipe(...)`, and `pipeAsync(...)`.
- Safe output rendering with `stringify(data, schema, options?)`.

## Quick Start

### 1. Define a schema

```ts
import { v } from "@pureq/validation";

const accountSchema = v.object({
  id: v.string().uuid(),
  email: v.string().email().policy({ pii: true, redact: "mask" }),
  active: v.boolean(),
});
```

### 2. Parse input

```ts
const input = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  email: "user@example.com",
  active: true,
};

const parsed = accountSchema.parse(input);

if (!parsed.ok) {
  console.error(parsed.error.code, parsed.error.path, parsed.error.message);
} else {
  console.log(parsed.value.data);
}
```

### 3. Serialize safely

```ts
import { stringify } from "@pureq/validation";

const output = stringify(input, accountSchema);

if (output.ok) {
  console.log(output.value);
}
```

## Core Concepts

### Result-first API

The public API does not throw for normal validation flow. Parsing returns a `Result`:

```ts
type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

This makes validation explicit, composable, and easy to test.

### ValidationResult

Successful parses return both the parsed value and the policy context:

```ts
type ValidationSuccess<T> = {
  data: T;
  policyMap: Record<string, ValidationPolicy>;
  metadata: ValidationPolicy;
};
```

That means the data and the security contract travel together.

### JSON Pointer policyMap keys

Field-level policy metadata uses RFC 6901 JSON Pointer keys such as `/profile/email`.

- `/` refers to the root.
- `~` is encoded as `~0`.
- `/` inside a token is encoded as `~1`.

### Policy merge rules

Policies merge deterministically:

- child scalar values override parent values
- `scope` is unioned and deduplicated
- `pii` is merged with OR semantics
- `guardrails` are appended in order

## Beginner Guide

If you are new to the package, use this order:

1. Start with `v.string()`, `v.number()`, and `v.boolean()`.
2. Move to `v.object(...)` for structured data.
3. Add `.policy(...)` only when you need metadata propagation or redaction.
4. Add `v.guard(...)` when you need business rules after structural validation.
5. Use `stringify(...)` only when you need policy-aware output.

### Example: a simple user schema

```ts
import { v } from "@pureq/validation";

const userSchema = v.object({
  name: v.string(),
  age: v.number(),
  isActive: v.boolean(),
});

const result = userSchema.parse({ name: "Ada", age: 42, isActive: true });
```

### Example: handling a failure

```ts
const result = userSchema.parse({ name: "Ada", age: "42", isActive: true });

if (!result.ok) {
  // result.error.code will tell you what failed
  // result.error.path will tell you where it failed
  console.error(result.error);
}
```

## Advanced Usage

### Nested policies

```ts
import { v } from "@pureq/validation";

const schema = v.object({
  profile: v.object({
    email: v.string().email().policy({ pii: true, redact: "mask" }),
    phone: v.string().policy({ pii: true, redact: "hide" }),
  }),
}).policy({ scope: ["user:read"] });
```

### Guard chains

```ts
import { ok, pipe, pipeAsync, v } from "@pureq/validation";

const positive = v.guard((value: number) => value > 0, "positive");
const underLimit = v.guard((value: number) => value < 100, "under-limit");

const syncResult = pipe(ok(42), positive, underLimit);

const asyncGuard = v.guard(async (value: number) => value % 2 === 0, "even");
const asyncResult = await pipeAsync(ok(42), positive, asyncGuard, underLimit);
```

### Policy-aware stringify

```ts
import { stringify, v } from "@pureq/validation";

const schema = v.object({
  publicId: v.string(),
  secret: v.string().policy({ scope: ["internal"], onDenied: "drop" }),
  email: v.string().email().policy({ pii: true, redact: "mask" }),
});

const output = stringify(
  {
    publicId: "acct_123",
    secret: "top-secret",
    email: "user@example.com",
  },
  schema,
  { scope: [] },
);
```

## API Reference

### Schema builders

- `v.string()` creates a string schema.
- `v.number()` creates a number schema.
- `v.boolean()` creates a boolean schema.
- `v.object(shape)` creates an object schema.
- `v.array(schema)` creates an array schema.

### Schema modifiers

- `.policy(metadata)` merges validation policy metadata.
- `.email()` adds an email format validator.
- `.uuid()` adds a UUID format validator.

### Guards

- `v.guard(fn, name?)` normalizes boolean, `Result`, and async guard functions.
- `v.guard(fn, { name, timeoutMs })` adds timeout control for async guards.
- `pipe(initial, ...steps)` chains synchronous validation steps.
- `pipeAsync(initial, ...steps)` chains synchronous or asynchronous steps.

### Serialization

- `stringify(data, schema, options?)` renders a policy-aware string.
- `options.scope` controls access checks for scoped fields.
- `options.maxDepth` limits nested parse depth during stringify.

### Parse Runtime Controls

- `parseWithOptions(schema, input, path?, options?)` applies runtime controls.
- `options.maxDepth` defaults to `20` and prevents deep-nesting DoS risks.
- `options.allowValueInErrors` defaults to `false` so input values are not included in format errors unless explicitly enabled.

## Redaction and Access Control

- `redact: "mask"` keeps the field and replaces the value with `[REDACTED]`.
- `redact: "hide"` removes the field from serialized output.
- `onDenied: "drop"` removes unauthorized fields.
- `onDenied: "error"` returns `FORBIDDEN_SCOPE`.

Important: `drop` means the key disappears entirely. It is not converted to `undefined` or `null`.

## Troubleshooting

### My error path looks wrong

Paths are normalized to JSON Pointer. If you pass `user.profile[0].email`, it becomes `/user/profile/0/email`.

### My output still contains sensitive data

Check these three things:

1. The field has `pii: true`.
2. The field has the right `redact` mode.
3. You are calling `stringify(...)` rather than `JSON.stringify(...)`.

### A scoped field is still present

Make sure `stringify(..., { scope })` includes the required scope, or set `onDenied: "drop"` if you want omission instead of failure.

## Documentation Map

- [Implementation Plan](./docs/Implementation_plan.md)
- [Issue Breakdown](./docs/Implementation_issue_breakdown.md)
- [Quickstart](./docs/quickstart.md)
- [Changelog](./CHANGELOG.md)
- [Release Notes](./docs/release-notes-v0.1.0-draft.md)
- [Docs Index](./docs/README.md)

## Verification

The package is covered by unit tests, type checking, language-policy checks, and a no-throw source gate.
