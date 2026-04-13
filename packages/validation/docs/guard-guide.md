# Guard Guide

This guide explains guardrail chaining with `v.guard`, `pipe`, and `pipeAsync`.

## What a Guard Does

A guard validates a value after structural parsing. It is useful for business rules such as ranges, cross-field checks, or domain constraints.

```ts
const positive = v.guard((value: number) => value > 0, "positive");
```

## Guard Return Forms

A guard function may return:

- `true` or `false`
- `Result<T, ValidationError>`
- `Promise<boolean>`
- `Promise<Result<T, ValidationError>>`

The guard wrapper normalizes those shapes into the package result contract.

## Synchronous Chaining

```ts
const checked = pipe(
  ok(42),
  positive,
  v.guard((value: number) => value < 100, "under-limit"),
);
```

`pipe(...)` is the right choice when every step is synchronous.

## Asynchronous Chaining

```ts
const even = v.guard(async (value: number) => value % 2 === 0, "even");
const asyncChecked = await pipeAsync(ok(42), positive, even);
```

`pipeAsync(...)` handles mixed sync and async steps in a stable order.

### Timeout control for async guards

```ts
const dbGuard = v.guard(
  async (value: string) => {
    // external check
    return value.length > 0;
  },
  { name: "db-check", timeoutMs: 200 },
);
```

When the timeout is exceeded, the guard returns a `GUARD_TIMEOUT` error.

## Failure Behavior

- Guards execute in the order they are passed.
- The chain stops on the first failure.
- Exceptions are normalized into `ValidationError`.

## Recommended Pattern

1. Parse the data with a schema.
2. Run guardrails for domain-specific checks.
3. Use the guarded value only after the result is `ok`.

```ts
const parsed = userSchema.parse(input);
if (parsed.ok) {
  const guarded = pipe(ok(parsed.value.data.age), positive);
}
```
