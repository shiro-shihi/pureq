import { describe, it, expect, vi, beforeEach } from "vitest";
import { DB } from "../../src/core/db.js";
import { table, column } from "../../src/schema/dsl.js";
import type { Driver, QueryResult } from "../../src/drivers/types.js";
import { PostgresDriver } from "../../src/drivers/adapters/postgres-node.js";
import { GenericCompiler } from "../../src/builder/compiler.js";

describe("Ultimate Chaos & Red-Team Legendary Assault", () => {
  const mockDriver: Driver = {
    execute: vi.fn().mockImplementation(async (query) => {
        return { rows: [] } as QueryResult;
    }),
    transaction: vi.fn(),
  };
  const db = new DB(mockDriver);

  const users = table("users", {
    id: column.string().primary(),
    userId: column.string(),
    name: column.string(),
  });

  const posts = table("posts", {
    id: column.string().primary(),
    userId: column.string(),
    content: column.string(),
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

  describe("Scenario 1: Unicode & Normalization Hardening", () => {
    it("should reject identifiers that could be normalized into dangerous chars", async () => {
        const fullWidthQuote = "\uFF02";
        expect(() => db.select().from(users).where(`${fullWidthQuote}id${fullWidthQuote}`, "=", "val"))
            .toThrow(/Security Exception: Potential Unicode normalization bypass/);
    });

    it("Scenario 1b: should reject NFKC-normalized dangerous characters like full-width space", () => {
        const normalizedDanger = "\u3000";
        expect(() => db.select().from(users).where(`id${normalizedDanger}--`, "=", "val"))
            .toThrow(/Security Exception: Potential Unicode normalization bypass/);
    });
  });

  describe("Scenario 2: Recursive Object & Circular Reference DoS", () => {
    it("should fail gracefully when encountering circular references", () => {
        const circular: any = { id: 1 };
        circular.self = circular;

        // In our latest implementation, where() throws synchronously on circular refs
        expect(() => db.select().from(users).where("id", "=", circular))
            .toThrow(/Security Exception: Circular reference detected/);
    });
  });

  describe("Scenario 3: Deep Policy Pushdown (Join RLS)", () => {
    it("should apply RLS to ALL joined tables to prevent shadowing bypass", async () => {
        const context = { userId: "victim-789" };
        
        await db.select()
            .from(users)
            .innerJoin("p", posts, (cols) => ({
                type: "binary",
                left: { type: "column", name: "id", table: "users" },
                operator: "=",
                right: { type: "column", name: "userId", table: "p" }
            }))
            .withContext(context as any)
            .execute();

        const [sql, params] = getLatestQuery();

        // The query should contain filters for both tables.
        // It might use "users"."userId" or "p"."userId"
        expect(sql).toMatch(/("users"\.)?"userId" = \?/);
        expect(sql).toMatch(/("p"\.)?"userId" = \?/);
        expect(params.filter((p: unknown) => p === "victim-789")).toHaveLength(2);
    });
  });

  describe("Scenario 4: Maximum Entropy OR-Chain DoS", () => {
    it("should handle extremely large OR-chains (5,000 nodes) efficiently", async () => {
        // Manually build a massive OR AST to simulate real DoS attempt
        let expr: any = { type: "literal", value: false };
        for (let i = 0; i < 5000; i++) {
            expr = {
                type: "binary",
                left: expr,
                operator: "OR",
                right: { 
                    type: "binary", 
                    left: { type: "column", name: "id" }, 
                    operator: "=", 
                    right: { type: "literal", value: i } 
                }
            };
        }

        const compiler = new GenericCompiler();
        const start = Date.now();
        const result = compiler.compileSelect({
            type: "select",
            table: "users",
            columns: "*",
            where: expr
        });
        const duration = Date.now() - start;

        expect(result.sql).toContain("OR");
        expect(duration).toBeLessThan(1000); 
    });
  });

  describe("Scenario 5: Postgres Specific & JSONB Path Protection", () => {
    it("should prevent subquery injection via JSONB path operator abuse", () => {
        // The operator whitelist should prevent using ->> or other path operators to inject subqueries
        expect(() => db.select().from(users).where("id", "->>", "(SELECT password FROM secrets)"))
            .toThrow(/Security Exception: Disallowed SQL operator/);
    });

    it("should ensure client release on transaction failure (Chaos Monkey)", async () => {
        const mockClient = {
            query: vi.fn().mockImplementation(async (sql) => {
                if (sql === "BEGIN") return {};
                if (sql === "SELECT 1") throw new Error("Chaos Monkey Strike");
                return { rows: [], rowCount: 0 };
            }),
            connect: vi.fn().mockImplementation(async () => ({
                query: vi.fn().mockImplementation(async (sql) => {
                    if (sql === "BEGIN") return {};
                    if (sql === "SELECT 1") throw new Error("Chaos Monkey Strike");
                    return { rows: [], rowCount: 0 };
                }),
                release: vi.fn()
            }))
        };
        
        const pgDriver = new PostgresDriver(mockClient as any);
        
        await expect(pgDriver.transaction(async (tx) => {
            await tx.execute("SELECT 1");
        })).rejects.toThrow("Chaos Monkey Strike");

        const dedicatedClient = await mockClient.connect.mock.results[0].value;
        expect(dedicatedClient.query).toHaveBeenCalledWith("ROLLBACK", []);
        expect(dedicatedClient.release).toHaveBeenCalled();
    });
  });

  describe("Scenario 6: Empty IN-clause Safe Conversion", () => {
    it("should convert empty IN arrays to safe (1 = 0) condition", async () => {
        await db.select().from(users).where("id", "IN", []).execute();
        
        const [sql] = getLatestQuery();
        // High-end implementation: id IN () becomes (1 = 0)
        expect(sql).toContain("WHERE (1 = 0)");
    });

    it("should convert empty NOT IN arrays to safe (1 = 1) condition", async () => {
        await db.select().from(users).where("id", "NOT IN", []).execute();
        
        const [sql] = getLatestQuery();
        expect(sql).toContain("WHERE (1 = 1)");
    });
  });
});
