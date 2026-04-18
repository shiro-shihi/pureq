import { describe, it, expect, vi, beforeEach } from "vitest";
import { DB } from "../../src/core/db.js";
import { table, column } from "../../src/schema/dsl.js";
import type { Driver, QueryResult } from "../../src/drivers/types.js";
import { PostgresDriver } from "../../src/drivers/postgres.js";

describe("Security Assault & Defense Tests", () => {
  const mockDriver: Driver = {
    execute: vi.fn().mockResolvedValue({ rows: [] } as QueryResult),
    transaction: vi.fn().mockImplementation(async (fn) => fn(mockDriver)),
  };
  const db = new DB(mockDriver);

  const users = table("users", {
    id: column.string().primary(),
    name: column.string(),
    email: column.string().policy({ pii: true, redact: "mask" }),
    salary: column.number().policy({ scope: ["admin"] }),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const getLatestQuery = () => (mockDriver.execute as any).mock.calls.at(-1);

  describe("SQL Injection - Identifier Evasion", () => {
    it("should neutralize double-quote evasion in table names", async () => {
        // Wrap table creation in expect because it throws synchronously
        expect(() => table('users"; DROP TABLE users; --', { id: column.string() }))
            .toThrow(/Security Exception/);
    });

    it("should neutralize double-quote evasion in column names", async () => {
        expect(() => table("users", {
            ['name"; DROP TABLE users; --']: column.string()
        })).toThrow(/Security Exception/);
    });
  });

  describe("SQL Injection - Operator Assault", () => {
    it("should reject malicious operators (Piggybacking / Logic Bypass)", () => {
        const maliciousOp = "= 'John') OR (1=1) --";
        expect(() => db.select().from(users).where("name", maliciousOp, "val"))
            .toThrow(/Security Exception: Disallowed SQL operator/);
    });

    it("should reject semicolon-based piggybacking in operators", () => {
        const maliciousOp = "= 'John'; DROP TABLE users; --";
        expect(() => db.select().from(users).where("name", maliciousOp, "val"))
            .toThrow(/Security Exception: Disallowed SQL operator/);
    });

    it("should only allow whitelisted operators", () => {
        expect(() => db.select().from(users).where("name", "SLEEP(5) =", "val"))
            .toThrow(/Security Exception: Disallowed SQL operator/);
    });
  });

  describe("SQL Injection - Function Assault", () => {
    it("should reject unauthorized or malicious function names", async () => {
        const compiler = new (await import("../../src/builder/compiler.js")).GenericCompiler();
        const maliciousExpr: any = { type: "function", name: "PG_SLEEP", args: [{ type: "literal", value: 5 }] };
        expect(() => (compiler as any).compileExpression(maliciousExpr))
            .toThrow(/Security Exception: Disallowed function name/);
    });
  });

  describe("Transaction Security - Concurrency Assault", () => {
    it("should ensure transaction isolation in PostgresDriver via dedicated clients", async () => {
        const mockClient = {
            query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
            connect: vi.fn().mockResolvedValue({
                query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
                release: vi.fn()
            })
        };
        const pgDriver = new PostgresDriver(mockClient as any);
        
        await pgDriver.transaction(async (tx) => {
            await tx.execute("SELECT 1");
        });

        // verify that connect was called to get a dedicated client
        expect(mockClient.connect).toHaveBeenCalled();
        const client = await mockClient.connect.mock.results[0].value;
        expect(client.query).toHaveBeenCalledWith("BEGIN", []);
        expect(client.query).toHaveBeenCalledWith("SELECT 1", []);
        expect(client.query).toHaveBeenCalledWith("COMMIT", []);
        expect(client.release).toHaveBeenCalled();
    });
  });

  describe("Value-based Injection (Parametric Safety)", () => {
    it("should handle malicious values safely using parameters", async () => {
        const maliciousValue = "'; DROP TABLE users; --";
        await db.select().from(users).where("name", "=", maliciousValue).execute();
        
        const [sql, params] = getLatestQuery();
        expect(sql).toContain('WHERE ("name" = ?)');
        expect(params).toContain(maliciousValue);
    });
  });

  describe("Data Privacy - PII & Redaction", () => {
    it("should carry policy metadata through validation bridge", async () => {
        const { toValidationSchema } = await import("../../src/schema/validation-bridge.js");
        const schema = toValidationSchema(users);
        
        // Use .metadata instead of ._def for @pureq/validation
        expect((schema.shape.email as any).metadata.pii).toBe(true);
        expect((schema.shape.email as any).metadata.redact).toBe("mask");
    });
  });

  describe("SQL Injection - Join Assault", () => {
    it("should neutralize injection in joined table names", () => {
        expect(() => {
            db.select().from(users).innerJoin("posts", table('posts"; DROP TABLE users; --', { id: column.string() }), ({ base, joined }) => ({
                type: "binary",
                left: { type: "column", name: "id", table: "users" },
                operator: "=",
                right: { type: "column", name: "userId", table: "p" }
            }));
        }).toThrow(/Security Exception/);
    });
  });

  describe("Blind SQL Injection Protection", () => {
    it("should prevent time-based blind injection via function whitelisting", async () => {
        const maliciousExpression: any = {
            type: "function",
            name: "sleep",
            args: [{ type: "literal", value: 5 }]
        };
        const compiler = new (await import("../../src/builder/compiler.js")).GenericCompiler();
        expect(() => (compiler as any).compileExpression(maliciousExpression))
            .toThrow(/Security Exception: Disallowed function name/);
    });
  });

  describe("Order By & Limit/Offset Hardening", () => {
    it("should sanitize Order By columns", () => {
        const maliciousOrder = 'name"; DROP TABLE users; --';
        expect(() => db.select().from(users).orderBy(maliciousOrder))
            .toThrow(/Security Exception: Invalid identifier/);
    });

    it("should force numeric types for Limit and Offset", () => {
        const maliciousLimit = "10; DROP TABLE users" as any;
        expect(() => db.select().from(users).limit(maliciousLimit))
            .toThrow(/Security Exception: Limit must be a valid number/);
        
        expect(() => db.select().from(users).offset(maliciousLimit))
            .toThrow(/Security Exception: Offset must be a valid number/);
    });
  });
});
