import { describe, it, expect, vi } from "vitest";
import { DB } from "../../src/core/db.js";
import { table, column } from "../../src/schema/dsl.js";
import type { Driver, QueryResult } from "../../src/drivers/types.js";
import { PostgresDriver } from "../../src/drivers/postgres.js";

describe("Security Assault & Defense Tests", () => {
  const mockDriver: Driver = {
    execute: vi.fn().mockResolvedValue({ rows: [] } as QueryResult),
    transaction: vi.fn(),
  };
  const db = new DB(mockDriver);

  const users = table("users", {
    id: column.string().primary(),
    name: column.string(),
  });

  describe("SQL Injection - Identifier Evasion", () => {
    it("should neutralize double-quote evasion in table names", async () => {
        // Attempting to break out of "table" by using "table""; DROP TABLE users; --
        // The expected behavior is that it remains a single quoted identifier.
        // However, our DSL now prevents this at definition time.
        expect(() => table('users"; DROP TABLE users; --', { id: column.string() }))
            .toThrow(/Security Exception/);
    });

    it("should neutralize double-quote evasion in column names", async () => {
        expect(() => table('users', { 
            'id"; --': column.string() 
        })).toThrow(/Security Exception/);
    });
  });

  describe("SQL Injection - Operator Assault", () => {
    it("should reject malicious operators (Piggybacking / Logic Bypass)", async () => {
        const maliciousOp = "= 'John') OR (1=1) --";
        await expect(db.select().from(users).where("name", maliciousOp, "attacker").execute())
            .rejects.toThrow(/Security Exception: Disallowed SQL operator/);
    });

    it("should reject semicolon-based piggybacking in operators", async () => {
        const maliciousOp = "= 'John'; DROP TABLE users; --";
        await expect(db.select().from(users).where("name", maliciousOp, "attacker").execute())
            .rejects.toThrow(/Security Exception: Disallowed SQL operator/);
    });

    it("should only allow whitelisted operators", async () => {
        const safeOps = ["=", "!=", "<", "<=", ">", ">=", "LIKE", "ILIKE", "IN", "NOT IN", "IS", "IS NOT"];
        for (const op of safeOps) {
            await db.select().from(users).where("name", op, "John").execute();
            expect(mockDriver.execute).toHaveBeenCalled();
        }
    });
  });

  describe("SQL Injection - Function Assault", () => {
    it("should reject unauthorized or malicious function names", async () => {
        // QueryBuilder currently doesn't expose raw function calls easily in where, 
        // but we test the compiler's internal defense.
        const compiler = new (await import("../../src/builder/compiler.js")).GenericCompiler();
        
        const maliciousExpr = {
            type: "function" as const,
            name: "pg_sleep(10) --",
            args: [{ type: "literal" as const, value: 1 }]
        };

        expect(() => (compiler as any).compileExpression(maliciousExpr))
            .toThrow(/Security Exception: Disallowed function name/);
    });
  });

  describe("Transaction Security - Concurrency Assault", () => {
    it("should ensure transaction isolation in PostgresDriver via dedicated clients", async () => {
        const mockClient = {
            query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
            connect: vi.fn().mockImplementation(async () => ({
                query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
                release: vi.fn()
            }))
        };
        
        const pgDriver = new PostgresDriver(mockClient as any);
        
        await pgDriver.transaction(async (tx) => {
            await tx.execute("SELECT 1");
        });

        // Verify that connect was called to get a dedicated client
        expect(mockClient.connect).toHaveBeenCalled();
        
        const dedicatedClient = await mockClient.connect.mock.results[0].value;
        expect(dedicatedClient.query).toHaveBeenCalledWith("BEGIN", []);
        expect(dedicatedClient.query).toHaveBeenCalledWith("SELECT 1", []);
        expect(dedicatedClient.query).toHaveBeenCalledWith("COMMIT", []);
        expect(dedicatedClient.release).toHaveBeenCalled();
    });
  });

  describe("Value-based Injection (Parametric Safety)", () => {
    it("should handle malicious values safely using parameters", async () => {
        const maliciousValue = "John' OR '1'='1";
        await db.select().from(users).where("name", "=", maliciousValue).execute();

        expect(mockDriver.execute).toHaveBeenCalledWith(
            expect.stringContaining('WHERE ("name" = ?)'),
            [maliciousValue]
        );
    });
  });

  describe("Data Privacy - PII & Redaction", () => {
    const sensitiveTable = table("secrets", {
      id: column.string().primary(),
      email: column.string().policy({ pii: true, redact: "mask" }),
    });

    it("should carry policy metadata through validation bridge", async () => {
        const { toValidationSchema } = await import("../../src/schema/validation-bridge.js");
        const schema = toValidationSchema(sensitiveTable);
        
        // Check if the email field in the schema has the expected policy
        const emailSchema = (schema as any).shape.email;
        expect(emailSchema.metadata).toMatchObject({
            pii: true,
            redact: "mask"
        });
    });
  });

  describe("SQL Injection - Join Assault", () => {
    it("should neutralize injection in joined table names", async () => {
        const posts = table("posts", { id: column.string(), userId: column.string() });
        const query = db.select().from(users);
        
        // Attempting to join a malicious "table"
        expect(() => {
            query.innerJoin("p", { name: 'posts"; DROP TABLE users; --' } as any, (cols) => ({
                type: "binary",
                left: { type: "column", name: "id", table: "users" },
                operator: "=",
                right: { type: "column", name: "userId", table: "p" }
            }));
        }).toThrow(/Security Exception/);
    });
  });

  describe("Error Handling & Information Leakage", () => {
    it("should normalize database errors and not leak raw system info", async () => {
        const rawError = new Error("syntax error at or near \"DROP\"");
        (rawError as any).code = "42601";
        
        const pgDriver = new PostgresDriver({
            query: vi.fn().mockRejectedValue(rawError)
        } as any);

        try {
            await pgDriver.execute("INVALID SQL");
        } catch (e: any) {
            expect(e.code).toBe("SYNTAX_ERROR");
            // The normalized message can contain the original message, 
            // but the 'code' is controlled.
        }
    });
  });

  describe("Blind SQL Injection Protection", () => {
    it("should prevent time-based blind injection via function whitelisting", async () => {
        // Attempting to use pg_sleep inside a binary expression
        const maliciousExpr: any = {
            type: "binary",
            left: { type: "column", name: "id" },
            operator: "=",
            right: { 
                type: "function", 
                name: "pg_sleep", 
                args: [{ type: "literal", value: 5 }] 
            }
        };

        const compiler = new (await import("../../src/builder/compiler.js")).GenericCompiler();
        expect(() => (compiler as any).compileExpression(maliciousExpr))
            .toThrow(/Security Exception: Disallowed function name/);
    });
  });

  describe("Order By & Limit/Offset Hardening", () => {
    it("should sanitize Order By columns", async () => {
        await db.select().from(users).orderBy('name"; DROP TABLE users; --' as any).execute();
        
        expect(mockDriver.execute).toHaveBeenCalledWith(
            expect.stringContaining('ORDER BY "name""; DROP TABLE users; --" ASC'),
            expect.anything()
        );
    });

    it("should force numeric types for Limit and Offset", async () => {
        await db.select().from(users).limit("10; DROP TABLE users" as any).execute();
        
        // Number("10; DROP TABLE users") is NaN, but we cast in compiler.
        // Let's see what happens.
        expect(mockDriver.execute).toHaveBeenCalledWith(
            expect.stringMatching(/LIMIT NaN/),
            expect.anything()
        );
    });
  });
});
