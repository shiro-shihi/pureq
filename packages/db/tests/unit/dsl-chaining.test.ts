import { describe, it, expect } from "vitest";
import { column } from "../../src/schema/dsl.js";

describe("DSL Chaining", () => {
  it("should support immutable chaining", () => {
    const base = column.string();
    const withNullable = base.nullable();
    const withPrimary = withNullable.primary();
    const withDefault = withPrimary.default("test");

    expect(base.options.nullable).toBeUndefined();
    expect(withNullable.options.nullable).toBe(true);
    expect(withNullable.options.primaryKey).toBeUndefined();
    expect(withPrimary.options.primaryKey).toBe(true);
    expect(withDefault.options.default).toBe("test");
  });

  it("should overwrite options in chain", () => {
    const col = column.number().default(1).default(2);
    expect(col.options.default).toBe(2);
  });

  it("should correctly store policy", () => {
    const col = column.string().policy({ pii: true });
    expect(col.options.policy?.pii).toBe(true);
  });

  it("should preserve existing options when adding policy", () => {
    const col = column.string().nullable().policy({ redact: "mask" });
    expect(col.options.nullable).toBe(true);
    expect(col.options.policy?.redact).toBe("mask");
  });

  it("should support all primitive types", () => {
    expect(column.string().type).toBe("string");
    expect(column.number().type).toBe("number");
    expect(column.boolean().type).toBe("boolean");
    expect(column.uuid().type).toBe("uuid");
    expect(column.date().type).toBe("date");
    expect(column.json().type).toBe("json");
  });
});
