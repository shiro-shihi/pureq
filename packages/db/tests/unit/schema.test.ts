import { describe, it, expect } from "vitest";
import { table, column } from "../../src/schema/dsl.js";
import { toValidationSchema } from "../../src/schema/validation-bridge.js";
import type { InferSelect, InferInsert } from "../../src/schema/inference.js";

describe("Schema DSL & Type Inference", () => {
  const users = table("users", {
    id: column.uuid().primary(),
    name: column.string(),
    email: column.string().policy({ pii: true }),
    age: column.number().nullable(),
    createdAt: column.date().default(new Date()),
  });

  it("should infer Select type correctly", () => {
    type User = InferSelect<typeof users>;
    
    // Check if type matches (this is a compile-time check mostly, but vitest can check if it exists)
    const user: User = {
      id: "uuid",
      name: "John",
      email: "john@example.com",
      age: null,
      createdAt: new Date(),
    };
    expect(user.name).toBe("John");
  });

  it("should infer Insert type correctly", () => {
    type NewUser = InferInsert<typeof users>;
    
    const newUser: NewUser = {
      name: "John",
      email: "john@example.com",
    };
    
    // id and createdAt should be optional because id is primary and createdAt has default
    // age is optional because it is nullable
    const anotherUser: NewUser = {
      id: "uuid",
      name: "John",
      email: "john@example.com",
      age: 30,
      createdAt: new Date(),
    };

    expect(newUser.name).toBe("John");
  });

  it("should generate validation schema with policies", () => {
    const schema = toValidationSchema(users);
    
    expect(schema).toBeDefined();
    // @ts-ignore - access private metadata for testing
    const emailMetadata = schema.shape.email.metadata;
    expect(emailMetadata.pii).toBe(true);
  });

  describe("Security - Identifier Validation", () => {
    it("should throw Security Exception for invalid table names", () => {
        expect(() => table("users; DROP TABLE users", { id: column.string() }))
            .toThrow(/Security Exception: Invalid table name/);
        
        expect(() => table("123users", { id: column.string() }))
            .toThrow(/Security Exception: Invalid table name/);
    });

    it("should throw Security Exception for invalid column names", () => {
        expect(() => table("users", { 
            "id-invalid": column.string() 
        })).toThrow(/Security Exception: Invalid column name/);
    });

    it("should allow valid identifiers", () => {
        expect(() => table("valid_table_name_123", { 
            column_name: column.string() 
        })).not.toThrow();
    });
  });
});
