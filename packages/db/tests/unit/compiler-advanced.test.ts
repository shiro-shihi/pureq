import { describe, it, expect } from "vitest";
import { GenericCompiler } from "../../src/builder/compiler.js";
import type { SelectStatement } from "../../src/builder/ast.js";

describe("GenericCompiler Advanced", () => {
  const compiler = new GenericCompiler();

  it("should compile complex nested binary expressions with quoted identifiers", () => {
    const statement: SelectStatement = {
      type: "select",
      table: "users",
      columns: "*",
      where: {
        type: "binary",
        left: {
          type: "binary",
          left: { type: "column", name: "age" },
          operator: ">",
          right: { type: "literal", value: 18 }
        },
        operator: "AND",
        right: {
          type: "binary",
          left: { type: "column", name: "status" },
          operator: "=",
          right: { type: "literal", value: "active" }
        }
      }
    };

    const { sql, params } = compiler.compileSelect(statement);
    expect(sql).toBe('SELECT * FROM "users" WHERE (("age" > ?) AND ("status" = ?))');
    expect(params).toEqual([18, "active"]);
  });

  it("should compile SQL functions with quoted identifiers", () => {
    const statement: SelectStatement = {
      type: "select",
      table: "users",
      columns: "*",
      where: {
        type: "binary",
        left: {
          type: "function",
          name: "LOWER",
          args: [{ type: "column", name: "email" }]
        },
        operator: "=",
        right: { type: "literal", value: "test@example.com" }
      }
    };

    const { sql, params } = compiler.compileSelect(statement);
    expect(sql).toBe('SELECT * FROM "users" WHERE (LOWER("email") = ?)');
    expect(params).toEqual(["test@example.com"]);
  });

  it("should compile multiple orders with quoted identifiers", () => {
    const statement: SelectStatement = {
      type: "select",
      table: "users",
      columns: ["id", "name"],
      orderBy: [
        { column: "name", direction: "ASC" },
        { column: "id", direction: "DESC" }
      ]
    };

    const { sql } = compiler.compileSelect(statement);
    expect(sql).toBe('SELECT "id", "name" FROM "users" ORDER BY "name" ASC, "id" DESC');
  });

  it("should handle offset and limit", () => {
    const statement: SelectStatement = {
      type: "select",
      table: "users",
      columns: "*",
      limit: 10,
      offset: 20
    };

    const { sql } = compiler.compileSelect(statement);
    expect(sql).toBe('SELECT * FROM "users" LIMIT 10 OFFSET 20');
  });
});
