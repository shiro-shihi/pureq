import { describe, it, expect, vi, beforeEach } from "vitest";
import { DB } from "../../src/core/db.js";
import { table, column } from "../../src/schema/dsl.js";
import type { Driver, QueryResult } from "../../src/drivers/types.js";
import { GenericCompiler } from "../../src/builder/compiler.js";

describe("Red Team: Advanced Adversarial Security Tests", () => {
  const mockDriver: Driver = {
    execute: vi.fn().mockResolvedValue({ rows: [] } as QueryResult),
    transaction: vi.fn(),
  };
  const db = new DB(mockDriver);

  const users = table("users", {
    id: column.string().primary(),
    role: column.string(),
    tenantId: column.string(),
    userId: column.string(), // Added for RLS tests
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Structural & Type-Juggling Attacks", () => {
    it("should neutralize prototype pollution or object-based injection in where clause", () => {
        // Attempting to pass an object with toString override to bypass string checks
        const maliciousObj = {
            toString: () => 'id" = \'admin\' --',
            __proto__: { polled: true }
        };

        // In our latest implementation, validateString throws Security Exception for non-strings
        expect(() => db.select().from(users).where(maliciousObj as any, "=", "value"))
            .toThrow(/Security Exception: Column must be a string/);
    });

    it("should prevent array-based injection where strings are expected", () => {
        const maliciousArray = ["id", 'admin" --'];
        expect(() => db.select().from(users).where(maliciousArray as any, "=", "value"))
            .toThrow(/Security Exception: Column must be a string/);
    });
  });

  describe("Unicode & Evasion Assault", () => {
    it("should block Null Byte injection in identifiers", () => {
        const nullByteId = "name\0; DROP TABLE users";
        const compiler = new GenericCompiler();
        // Our compiler now throws on control characters for safety
        expect(() => (compiler as any).quoteIdentifier(nullByteId)).toThrow(/Security Exception: Control characters detected/);
    });

    it("should handle Unicode homoglyph attacks safely", () => {
        // Using a Cyrillic 'а' instead of Latin 'a'
        const homoglyphTable = "usеrs"; // Cyrillic 'е'
        expect(() => table(homoglyphTable, { id: column.string() }))
            .toThrow(/Security Exception/); // Regex /^[a-zA-Z_].../ will fail
    });
  });

  describe("Resource Exhaustion (DoS) Assault", () => {
    it("should mitigate stack overflow from deeply nested expressions", async () => {
        let expr: any = { type: "column", name: "id" };
        // Create a 1000-level nested AND expression
        for (let i = 0; i < 1000; i++) {
            expr = {
                type: "binary",
                left: expr,
                operator: "AND",
                right: { type: "literal", value: 1 }
            };
        }

        const compiler = new GenericCompiler();
        // This tests if the recursive compiler hits stack limits or remains performant
        const start = Date.now();
        const result = compiler.compileSelect({
            type: "select",
            table: "users",
            columns: "*",
            where: expr
        });
        const duration = Date.now() - start;

        expect(result.sql).toBeDefined();
        expect(duration).toBeLessThan(1000); 
    });

    it("should handle extremely large IN clauses safely", async () => {
        const largeList = Array.from({ length: 10000 }, (_, i) => i);
        await db.select().from(users).where("id", "IN", largeList).execute();
        
        const lastParams = (mockDriver.execute as any).mock.calls.at(-1)[1];
        expect(lastParams).toHaveLength(10000);
    });
  });

  describe("Policy & RLS Sandbox Escape", () => {
    it("should prevent overriding RLS filters via manual WHERE clauses", async () => {
        // Simulate a query with context (RLS)
        const context = { userId: "user-123" };
        const query = db.select().from(users).withContext(context as any);
        
        // Attacker tries to inject "OR 1=1" or similar via the value 
        // to bypass the userId = 'user-123' check
        await query.where("id", "=", "some-id' OR '1'='1").execute();

        const lastQuery = (mockDriver.execute as any).mock.calls.at(-1)[0];
        const lastParams = (mockDriver.execute as any).mock.calls.at(-1)[1];

        // The order might depend on implementation. We check for both filters.
        expect(lastQuery).toMatch(/("users"\.)?"userId" = \?/);
        expect(lastQuery).toMatch(/"id" = \?/);
        expect(lastParams).toContain("user-123");
        expect(lastParams).toContain("some-id' OR '1'='1");
    });

    it("should reject 'IS' / 'IS NOT' operator abuse with malicious RHS", async () => {
        // Attempting to inject logic via the literal value of an IS operator
        await db.select().from(users).where("id", "IS", "TRUE; DROP TABLE users").execute();
        
        const lastQuery = (mockDriver.execute as any).mock.calls.at(-1)[0];
        expect(lastQuery).toContain('WHERE ("id" IS ?)');
    });
  });
});
