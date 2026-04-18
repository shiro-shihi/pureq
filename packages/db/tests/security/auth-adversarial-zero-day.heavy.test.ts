import { describe, it, expect, vi, beforeEach } from "vitest";
import { DB } from "../../src/core/db.js";
import { table, column } from "../../src/schema/dsl.js";
import type { Driver, QueryResult } from "../../src/drivers/types.js";

describe("Adversarial Zero-Day Security Assault", () => {
  const mockDriver: Driver = {
    execute: vi.fn().mockResolvedValue({ rows: [] } as QueryResult),
    transaction: vi.fn(),
  };
  const db = new DB(mockDriver);

  const users = table("users", {
    id: column.string().primary(),
    data: column.json(),
  });

  const getLatestQuery = () => (mockDriver.execute as any).mock.calls.at(-1);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Hardened Input Validation (Fail-Fast)", () => {
    it("should prevent identifier starting with number or special char", () => {
        // SQL standard identifiers cannot start with numbers
        expect(() => db.select().from(users).where("1id", "=", "val"))
            .toThrow(/Security Exception: Invalid identifier/);
            
        expect(() => db.select().from(users).where("@id", "=", "val"))
            .toThrow(/Security Exception: Invalid identifier/);
    });

    it("should reject backtick and dollar in identifiers (template literal / dollar-quoting attack)", () => {
        // Backticks (MySQL style) or Dollars (PG Dollar-quoting) are strictly forbidden
        expect(() => db.select().from(users).where("id` --", "=", "val"))
            .toThrow(/Security Exception: Invalid identifier/);
            
        expect(() => db.select().from(users).where("id$1", "=", "val"))
            .toThrow(/Security Exception: Invalid identifier/);
    });

    it("should throw SecurityException for object-based column injection (Prototype Pollution attempt)", async () => {
        const maliciousObj = { toString: () => "id" };
        // Should throw BEFORE compiler because builder.where() now validates types
        expect(() => db.select().from(users).where(maliciousObj as any, "=", "val"))
            .toThrow(/Security Exception: Column must be a string/);
    });

    it("should throw SecurityException for Null Byte in identifiers", async () => {
        // Even if it passes DSL (e.g. dynamic name), the compiler must catch it
        const compiler = new (await import("../../src/builder/compiler.js")).GenericCompiler();
        expect(() => (compiler as any).quoteIdentifier("id\0name"))
            .toThrow(/Security Exception: Control characters detected/);
    });

    it("should reject newline/carriage return in identifiers to prevent multi-line injection", async () => {
        expect(() => db.select().from(users).where("id\n--", "=", "val"))
            .toThrow(/Security Exception: Control characters detected/);
    });
  });

  describe("Advanced SQL Injection Evasion", () => {
    it("should neutralize comment injection inside identifiers", async () => {
        // Trying to hide the rest of the query: "id" --
        // Now it's checked by IDENTIFIER_REGEX in quoteIdentifier
        expect(() => db.select().from(users).where('id" --', "=", "val"))
            .toThrow(/Security Exception: Invalid identifier/);
    });

    it("should handle multiline comment injection in operators", async () => {
        const maliciousOp = "/* comment */ =";
        expect(() => db.select().from(users).where("id", maliciousOp, "val"))
            .toThrow(/Security Exception: Disallowed SQL operator/);
    });
  });

  describe("Complex Bypass Attempts (CTE & UNION)", () => {
    it("should prevent UNION-based data exfiltration via parameterization", async () => {
        const maliciousValue = "1' UNION SELECT password FROM users --";
        await db.select().from(users).where("id", "=", maliciousValue).execute();
        
        const [sql, params] = getLatestQuery();
        expect(sql).toContain('WHERE ("id" = ?)');
        expect(params).toContain(maliciousValue);
    });

    it("should prevent CTE-based logic injection in identifiers", async () => {
        // Attempting to inject a WITH clause before SELECT
        const maliciousTable = "users; WITH leaked AS (SELECT * FROM secrets) SELECT * FROM leaked; --";
        expect(() => table(maliciousTable as any, { id: column.string() }))
            .toThrow(/Security Exception/);
    });
  });

  describe("PostgreSQL Specific Assaults", () => {
    it("should reject malicious JSONB operators used as binary operators", async () => {
        // PG operators like ->> or #> should be whitelisted or rejected
        const maliciousOp = "->> 'password' = 'secret' OR '1'='1";
        expect(() => db.select().from(users).where("data", maliciousOp, "val"))
            .toThrow(/Security Exception: Disallowed SQL operator/);
    });

    it("should handle (and ideally limit) extreme parameter counts (PG 65k limit)", async () => {
        const extremeList = Array.from({ length: 70000 }, (_, i) => i);
        // This is a stress test for the compiler and driver interface
        await db.select().from(users).where("id", "IN", extremeList).execute();
        
        const [_, params] = getLatestQuery();
        expect(params).toHaveLength(70000);
    });

    it("should prevent operator confusion with JSONB path injection", () => {
        // Attempting to bypass operator check by including SQL logic in the 'operator' string
        expect(() => db.select().from(users).where("data", "->>'password' = 'secret' OR ", "1"))
            .toThrow(/Security Exception: Disallowed SQL operator/);
    });

    it("should reject dollar-quoting evasion attempts in identifiers", () => {
        // PG dollar-quoting: $$id$$
        expect(() => db.select().from(users).where("$$id$$", "=", "val"))
            .toThrow(/Security Exception: Invalid identifier/);
    });
  });

  describe("Boolean & Numeric Type Confusion", () => {
    it("should prevent boolean logic injection in numeric comparisons", async () => {
        // WHERE id = 1 OR 1=1
        const maliciousValue = "1 OR 1=1";
        await db.select().from(users).where("id", "=", maliciousValue).execute();
        
        const [sql, params] = getLatestQuery();
        expect(sql).toContain('WHERE ("id" = ?)');
        expect(params).toContain(maliciousValue);
    });
  });
});
