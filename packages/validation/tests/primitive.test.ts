import { describe, expect, it } from "vitest";
import { VALIDATION_ERROR_CODES } from "../src/errors/validation-error";
import { parseWithOptions } from "../src/schema/base";
import { v } from "../src/schema/factory";
import { DEFAULT_VALIDATION_POLICY } from "../src/policy/merge";

describe("primitive schemas", () => {
  it("string schema validates string values", () => {
    const schema = v.string();
    const success = schema.parse("hello");
    const failure = schema.parse(10, "/name");

    expect(success.ok).toBe(true);
    if (success.ok) {
      expect(success.value.data).toBe("hello");
      expect(success.value.policyMap["/"]).toEqual(DEFAULT_VALIDATION_POLICY);
      expect(success.value.metadata).toEqual(DEFAULT_VALIDATION_POLICY);
    }
    expect(failure.ok).toBe(false);
    if (!failure.ok) {
      expect(failure.error.code).toBe(VALIDATION_ERROR_CODES.INVALID_TYPE);
      expect(failure.error.path).toBe("/name");
    }
  });

  it("number schema validates numeric values and rejects NaN", () => {
    const schema = v.number();
    const success = schema.parse(42);
    const failure = schema.parse(Number.NaN, "/age");

    expect(success.ok).toBe(true);
    if (success.ok) {
      expect(success.value.data).toBe(42);
    }
    expect(failure.ok).toBe(false);
    if (!failure.ok) {
      expect(failure.error.code).toBe(VALIDATION_ERROR_CODES.INVALID_TYPE);
    }
  });

  it("boolean schema validates boolean values", () => {
    const schema = v.boolean();
    const success = schema.parse(true);
    const failure = schema.parse("true", "/enabled");

    expect(success.ok).toBe(true);
    if (success.ok) {
      expect(success.value.data).toBe(true);
    }
    expect(failure.ok).toBe(false);
    if (!failure.ok) {
      expect(failure.error.code).toBe(VALIDATION_ERROR_CODES.INVALID_TYPE);
    }
  });

  it("string email validator behaves deterministically", () => {
    const schema = v.string().email();
    const success = schema.parse("user@example.com");
    const failure = schema.parse("not-email", "/email");

    expect(success.ok).toBe(true);
    if (success.ok) {
      expect(success.value.data).toBe("user@example.com");
    }
    expect(failure.ok).toBe(false);
    if (!failure.ok) {
      expect(failure.error.code).toBe(VALIDATION_ERROR_CODES.INVALID_FORMAT);
      expect(failure.error.details).toEqual({
        format: "email",
      });
    }
  });

  it("string uuid validator behaves deterministically", () => {
    const schema = v.string().uuid();
    const success = schema.parse("550e8400-e29b-41d4-a716-446655440000");
    const failure = schema.parse("123", "/id");

    expect(success.ok).toBe(true);
    if (success.ok) {
      expect(success.value.data).toBe("550e8400-e29b-41d4-a716-446655440000");
    }
    expect(failure.ok).toBe(false);
    if (!failure.ok) {
      expect(failure.error.code).toBe(VALIDATION_ERROR_CODES.INVALID_FORMAT);
      expect(failure.error.path).toBe("/id");
    }
  });

  it("policy chaining merges metadata deterministically", () => {
    const schema = v
      .string()
      .policy({ scope: ["user:read"], pii: false, redact: "none" })
      .policy({ scope: ["audit:read", "user:read"], pii: true, redact: "mask" });

    const result = schema.parse("ok", "/email");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata).toEqual({
        redact: "mask",
        pii: true,
        scope: ["user:read", "audit:read"],
        guardrails: [],
        onDenied: "error",
      });
      expect(result.value.policyMap["/email"]).toEqual(result.value.metadata);
    }
  });

  it("includes invalid format value only when allowValueInErrors is enabled", () => {
    const schema = v.string().email();

    const hidden = schema.parse("not-email", "/email");
    expect(hidden.ok).toBe(false);
    if (!hidden.ok) {
      expect(hidden.error.details).toEqual({
        format: "email",
      });
    }

    const verbose = parseWithOptions(schema, "not-email", "/email", {
      allowValueInErrors: true,
    });

    expect(verbose.ok).toBe(false);
    if (!verbose.ok) {
      expect(verbose.error.details).toEqual({
        format: "email",
        value: "not-email",
      });
    }
  });
});