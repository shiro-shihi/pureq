import { describe, expect, expectTypeOf, it } from "vitest";
import { VALIDATION_ERROR_CODES } from "../src/errors/validation-error";
import { stringify } from "../src/stringify/stringify";
import type { DeniedDrop } from "../src/stringify/types";
import { v } from "../src/schema/factory";

describe("stringify", () => {
  it("masks pii fields when redact is mask", () => {
    const schema = v.object({
      profile: v.object({
        email: v.string().policy({ pii: true, redact: "mask" }),
      }),
    });

    const result = stringify({ profile: { email: "user@example.com" } }, schema);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('{"profile":{"email":"[REDACTED]"}}');
    }
  });

  it("hides pii fields when redact is hide", () => {
    const schema = v.object({
      profile: v.object({
        email: v.string().policy({ pii: true, redact: "hide" }),
      }),
    });

    const result = stringify({ profile: { email: "user@example.com" } }, schema);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('{"profile":{}}');
    }
  });

  it("drops unauthorized fields when onDenied is drop", () => {
    const schema = v.object({
      public: v.string(),
      secret: v.string().policy({ scope: ["internal"], onDenied: "drop" }),
    });

    const result = stringify({ public: "ok", secret: "hidden" }, schema, { scope: [] });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('{"public":"ok"}');
    }
  });

  it("returns an error when onDenied is error", () => {
    const schema = v.object({
      public: v.string(),
      secret: v.string().policy({ scope: ["internal"], onDenied: "error" }),
    });

    const result = stringify({ public: "ok", secret: "hidden" }, schema, { scope: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(VALIDATION_ERROR_CODES.FORBIDDEN_SCOPE);
      expect(result.error.path).toBe("/secret");
    }
  });

  it("applies access decisions recursively to arrays", () => {
    const schema = v.object({
      items: v.array(
        v.object({
          value: v.string(),
          secret: v.string().policy({ scope: ["internal"], onDenied: "drop" }),
        }),
      ),
    });

    const result = stringify(
      { items: [{ value: "a", secret: "x" }, { value: "b", secret: "y" }] },
      schema,
      { scope: [] },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('{"items":[{"value":"a"},{"value":"b"}]}');
    }
  });

  it("exposes the DeniedDrop helper type", () => {
    type Source = {
      public: string;
      nested: {
        secret: string;
      };
      items: Array<{ hidden: boolean }>;
    };

    expectTypeOf<DeniedDrop<Source>>().toEqualTypeOf<{
      public?: string;
      nested?: {
        secret?: string;
      };
      items?: Array<{
        hidden?: boolean;
      }>;
    }>();
  });

  it("returns forbidden_key for dangerous object keys", () => {
    const schema = v.object({
      ["__proto__"]: v.object({
        value: v.string(),
      }),
    });

    const result = stringify(JSON.parse('{"__proto__":{"value":"x"}}'), schema);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(VALIDATION_ERROR_CODES.FORBIDDEN_KEY);
      expect(result.error.path).toBe("/__proto__");
    }
  });

  it("returns max_depth_exceeded when stringify input exceeds configured maxDepth", () => {
    const schema = v.object({
      child: v.object({
        child: v.object({
          value: v.string(),
        }),
      }),
    });

    const result = stringify(
      {
        child: {
          child: {
            value: "ok",
          },
        },
      },
      schema,
      { maxDepth: 2 },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(VALIDATION_ERROR_CODES.MAX_DEPTH_EXCEEDED);
      expect(result.error.path).toBe("/child/child");
    }
  });
});