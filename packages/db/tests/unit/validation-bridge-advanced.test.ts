import { describe, it, expect } from "vitest";
import { isOk } from "@pureq/validation";
import { table, column } from "../../src/schema/dsl.js";
import { toValidationSchema } from "../../src/schema/validation-bridge.js";

describe("Validation Bridge Advanced", () => {
  it("should handle columns with multiple policies", () => {
    const sensitive = table("sensitive", {
      secret: column.string().policy({
        pii: true,
        scope: ["admin"],
        redact: "hide"
      })
    });

    const schema = toValidationSchema(sensitive);
    const metadata = schema.shape.secret.metadata;
    
    expect(metadata.pii).toBe(true);
    expect(metadata.scope).toEqual(["admin"]);
    expect(metadata.redact).toBe("hide");
  });

  it("should handle various column types correctly", () => {
    const complex = table("complex", {
      uuid: column.uuid(),
      date: column.date(),
      json: column.json(),
    });

    const schema = toValidationSchema(complex);
    expect(schema.shape.uuid).toBeDefined();
    expect(schema.shape.date).toBeDefined();
    expect(schema.shape.json).toBeDefined();
  });

  it("should handle nullable columns in validation", () => {
    const optional = table("optional", {
        age: column.number().nullable()
    });

    const schema = toValidationSchema(optional);
    
    // Valid input
    expect(isOk(schema.parse({ age: 25 }))).toBe(true);
    expect(isOk(schema.parse({ age: null }))).toBe(true);
    
    // Invalid input
    expect(isOk(schema.parse({ age: "not-a-number" }))).toBe(false);
  });
});
