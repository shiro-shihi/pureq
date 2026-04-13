import { describe, expect, expectTypeOf, it } from "vitest";
import type { Infer } from "../src/schema/base";
import { parseWithOptions } from "../src/schema/base";
import { VALIDATION_ERROR_CODES } from "../src/errors/validation-error";
import { v } from "../src/schema/factory";

describe("composite schemas", () => {
  it("object schema parses nested values and emits JSON Pointer policy keys", () => {
    const schema = v.object({
      profile: v.object({
        email: v.string().email().policy({ pii: true, redact: "mask" }),
      }),
      enabled: v.boolean(),
    });

    const result = schema.parse(
      {
        profile: { email: "user@example.com" },
        enabled: true,
      },
      "/user",
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.data).toEqual({
        profile: { email: "user@example.com" },
        enabled: true,
      });

      expect(Object.keys(result.value.policyMap).sort()).toEqual([
        "/user",
        "/user/enabled",
        "/user/profile",
        "/user/profile/email",
      ]);
    }
  });

  it("object schema reports nested error path accurately", () => {
    const schema = v.object({
      profile: v.object({
        email: v.string().email(),
      }),
    });

    const result = schema.parse({ profile: { email: "invalid" } }, "$.user");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(VALIDATION_ERROR_CODES.INVALID_FORMAT);
      expect(result.error.path).toBe("/user/profile/email");
    }
  });

  it("array schema validates items and tracks indexed paths", () => {
    const schema = v.array(v.number());

    const success = schema.parse([1, 2, 3], "items");
    expect(success.ok).toBe(true);
    if (success.ok) {
      expect(success.value.data).toEqual([1, 2, 3]);
      expect(Object.keys(success.value.policyMap).sort()).toEqual([
        "/items",
        "/items/0",
        "/items/1",
        "/items/2",
      ]);
    }

    const failure = schema.parse([1, "x", 3], "items");
    expect(failure.ok).toBe(false);
    if (!failure.ok) {
      expect(failure.error.code).toBe(VALIDATION_ERROR_CODES.INVALID_TYPE);
      expect(failure.error.path).toBe("/items/1");
    }
  });

  it("infer resolves nested object and array types", () => {
    const schema = v.object({
      id: v.string(),
      tags: v.array(v.string()),
      flags: v.object({
        active: v.boolean(),
      }),
    });

    type Output = Infer<typeof schema>;

    expectTypeOf<Output>().toEqualTypeOf<{
      id: string;
      tags: string[];
      flags: {
        active: boolean;
      };
    }>();
  });

  it("rejects forbidden object keys to prevent prototype pollution", () => {
    const schema = v.object({
      ["__proto__"]: v.object({
        polluted: v.boolean(),
      }),
    });

    const result = schema.parse(JSON.parse('{"__proto__":{"polluted":true}}'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(VALIDATION_ERROR_CODES.FORBIDDEN_KEY);
      expect(result.error.path).toBe("/__proto__");
    }
  });

  it("does not leak metadata mutations across parse calls", () => {
    const schema = v.string().policy({ scope: ["internal"] });
    const first = schema.parse("ok");
    expect(first.ok).toBe(true);

    if (!first.ok) {
      return;
    }

    first.value.metadata.scope.push("mutated");
    const second = schema.parse("ok");

    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value.metadata.scope).toEqual(["internal"]);
      expect(second.value.policyMap["/"].scope).toEqual(["internal"]);
    }
  });

  it("returns cyclic_reference for self-referential inputs", () => {
    const schema = v.object({
      node: v.object({
        value: v.string(),
      }),
    });

    const source: Record<string, unknown> = Object.create(null);
    source.node = source;

    const result = schema.parse(source);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(VALIDATION_ERROR_CODES.CYCLIC_REFERENCE);
      expect(result.error.path).toBe("/node");
    }
  });

  it("returns max_depth_exceeded when nested input exceeds configured limit", () => {
    const schema = v.object({
      child: v.object({
        child: v.object({
          value: v.string(),
        }),
      }),
    });

    const result = parseWithOptions(
      schema,
      {
        child: {
          child: {
            value: "ok",
          },
        },
      },
      "/",
      { maxDepth: 2 },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(VALIDATION_ERROR_CODES.MAX_DEPTH_EXCEEDED);
      expect(result.error.path).toBe("/child/child");
    }
  });
});
