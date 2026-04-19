import { describe, it, expect, vi, beforeEach } from "vitest";
import { DB } from "../../src/core/db.js";
import { table, column } from "../../src/schema/dsl.js";
import type { Driver, QueryResult } from "../../src/drivers/types.js";
import { PostgresDriver } from "../../src/drivers/adapters/postgres-node.js";

describe("Adversarial Zero-Day Security Assault", () => {
  const mockDriver: Driver = {
    execute: vi.fn().mockImplementation(async (query) => {
        return { rows: [] } as QueryResult;
    }),
    transaction: vi.fn().mockImplementation(async (fn) => fn(mockDriver)),
  };
  const db = new DB(mockDriver);

  const users = table("users", {
    id: column.string().primary(),
    name: column.string(),
  });

  const getLatestQuery = () => {
    const call = (mockDriver.execute as any).mock.calls.at(-1);
    const query = call[0];
    const sql = typeof query === "string" ? query : query.sql;
    return [sql, call[1]];
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Hardened Input Validation (Fail-Fast)", () => {
    it("should prevent identifier starting with number or special char", () => {
        expect(() => db.select().from(users).where("1id", "=", "val")).toThrow(/Security Exception: Invalid identifier/);
    });

    it("should reject backtick and dollar in identifiers (template literal / dollar-quoting attack)", () => {
        expect(() => db.select().from(users).where("id`", "=", "val")).toThrow(/Security Exception: Invalid identifier/);
        expect(() => db.select().from(users).where("id$", "=", "val")).toThrow(/Security Exception: Invalid identifier/);
    });

    it("should throw SecurityException for object-based column injection (Prototype Pollution attempt)", () => {
        const malicious = JSON.parse('{"__proto__": {"polluted": true}}');
        expect(() => db.select().from(users).where(malicious, "=", "val")).toThrow(/Security Exception: Column must be a string/);
    });

    it("should throw SecurityException for Null Byte in identifiers", () => {
        expect(() => db.select().from(users).where("id\0", "=", "val")).toThrow(/Security Exception: Control characters detected/);
    });

    it("should reject newline/carriage return in identifiers to prevent multi-line injection", () => {
        expect(() => db.select().from(users).where("id\n--", "=", "val")).toThrow(/Security Exception: Control characters detected/);
    });
  });

  describe("Advanced SQL Injection Evasion", () => {
    it("should neutralize comment injection inside identifiers", () => {
        expect(() => db.select().from(users).where("id/*", "=", "val")).toThrow(/Security Exception: Invalid identifier/);
    });

    it("should handle multiline comment injection in operators", () => {
        expect(() => db.select().from(users).where("id", "=/*", "val")).toThrow(/Security Exception: Disallowed SQL operator/);
    });
  });

  describe("Complex Bypass Attempts (CTE & UNION)", () => {
    it("should prevent UNION-based data exfiltration via parameterization", async () => {
        const maliciousValue = "' UNION SELECT password FROM users--";
        await db.select().from(users).where("id", "=", maliciousValue).execute();

        const [sql, params] = getLatestQuery();
        expect(sql).toContain('WHERE ("id" = ?)');
        expect(params).toContain(maliciousValue);
    });

    it("should prevent CTE-based logic injection in identifiers", () => {
        const cteAttack = "id) WITH x AS (SELECT 1) SELECT * FROM x WHERE (1=1";
        expect(() => db.select().from(users).where(cteAttack, "=", "val")).toThrow(/Security Exception: Invalid identifier/);
    });
  });

  describe("PostgreSQL Specific Assaults", () => {
    it("should reject malicious JSONB operators used as binary operators", () => {
        expect(() => db.select().from(users).where("id", "->>", "val")).toThrow(/Security Exception: Disallowed SQL operator/);
    });

    it("should handle (and ideally limit) extreme parameter counts (PG 65k limit)", async () => {
        const massiveArray = Array.from({ length: 70000 }).map((_, i) => i);
        const pgDriver = new PostgresDriver({ query: vi.fn().mockResolvedValue({ rows: [] }) } as any);
        // id IN (?) passes an array as a SINGLE parameter at the top level, 
        // but our enhanced check counts the elements inside.
        await expect(pgDriver.execute("SELECT * FROM users WHERE id IN (?)", [massiveArray]))
            .rejects.toThrow(/Security Exception: Too many query parameters/);
    });

    it("should allow operator for string concatenation (used in PII masking)", async () => {
        await db.select().from(users).where("id", "||", "val").execute();
        const [sql] = getLatestQuery();
        expect(sql).toContain('WHERE ("id" || ?)');
    });

    it("should reject dollar-quoting evasion attempts in identifiers", () => {
        expect(() => db.select().from(users).where("id$tag$", "=", "val")).toThrow(/Security Exception: Invalid identifier/);
    });
  });

  describe("Boolean & Numeric Type Confusion", () => {
    it("should prevent boolean logic injection in numeric comparisons", async () => {
        const maliciousValue = "1 OR 1=1";
        await db.select().from(users).where("id", "=", maliciousValue).execute();

        const [sql, params] = getLatestQuery();
        expect(sql).toContain('WHERE ("id" = ?)');
        expect(params).toContain(maliciousValue);
    });
  });
});
