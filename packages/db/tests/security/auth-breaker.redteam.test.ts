import { describe, it, expect, vi, beforeEach } from "vitest";
import { DB } from "../../src/core/db.js";
import { table, column } from "../../src/schema/dsl.js";
import type { Driver, QueryResult } from "../../src/drivers/types.js";
import { PostgresDriver } from "../../src/drivers/adapters/postgres-node.js";
import { GenericCompiler } from "../../src/builder/compiler.js";

describe("Red Team: Advanced Adversarial Security Tests", () => {
  const mockDriver: Driver = {
    execute: vi.fn().mockImplementation(async (query) => {
        return { rows: [] } as QueryResult;
    }),
    transaction: vi.fn().mockImplementation(async (fn) => fn(mockDriver)),
  };
  const db = new DB(mockDriver);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const getLatestQuery = () => {
    const call = (mockDriver.execute as any).mock.calls.at(-1);
    const query = call[0];
    const sql = typeof query === "string" ? query : query.sql;
    return [sql, call[1]];
  };

  const users = table("users", {
    id: column.string().primary(),
    userId: column.string(),
    name: column.string(),
    role: column.string(),
  });

  describe("Structural & Type-Juggling Attacks", () => {
    it("should neutralize prototype pollution or object-based injection in where clause", () => {
        const malicious = JSON.parse('{"__proto__": {"polluted": true}}');
        expect(() => db.select().from(users).where(malicious as any, "=", "val")).toThrow();
    });

    it("should prevent array-based injection where strings are expected", () => {
        expect(() => db.select().from(users).where(["id", "role"] as any, "=", "val")).toThrow();
    });
  });

  describe("Unicode & Evasion Assault", () => {
    it("should block Null Byte injection in identifiers", () => {
        expect(() => db.select().from(users).where("id\0--", "=", "val")).toThrow(/Security Exception: Control characters detected/);
    });

    it("should handle Unicode homoglyph attacks safely", () => {
        const homoglyph = "іd"; // Cyrillic 'i'
        expect(() => db.select().from(users).where(homoglyph, "=", "val")).toThrow(/Security Exception: Invalid identifier/);
    });
  });

  describe("Resource Exhaustion (DoS) Assault", () => {
    it("should mitigate stack overflow from deeply nested expressions", () => {
        let expr: any = { type: "column", name: "id" };
        for (let i = 0; i < 2000; i++) {
            expr = { type: "binary", left: expr, operator: "AND", right: { type: "literal", value: i } };
        }
        const compiler = new GenericCompiler();
        expect(() => compiler.compileSelect({ type: "select", table: "users", columns: "*", where: expr })).not.toThrow();
    });

    it("should handle extremely large IN clauses safely", async () => {
        const massiveArray = Array.from({ length: 10000 }).map((_, i) => i);
        await db.select().from(users).where("id", "IN", massiveArray).execute();
        const [sql, params] = getLatestQuery();
        expect(params).toHaveLength(10000);
        expect(sql).toContain("IN (");
    });
  });

  describe("Policy & RLS Sandbox Escape", () => {
    it("should prevent overriding RLS filters via manual WHERE clauses", async () => {
        const context = { userId: "user-123" };
        await db.select().from(users).where("id", "=", "any").withContext(context as any).execute();
        
        const [lastQuery, lastParams] = getLatestQuery();

        expect(lastQuery).toMatch(/("users"\.)?"userId" = \?/);
        expect(lastQuery).toMatch(/"id" = \?/);
        expect(lastParams).toContain("user-123");
    });

    it("should reject 'IS' / 'IS NOT' operator abuse with malicious RHS", async () => {
        await db.select().from(users).where("id", "IS", null).execute();
        const [lastQuery] = getLatestQuery();
        expect(lastQuery).toContain('WHERE ("id" IS ?)');
    });
  });
});
