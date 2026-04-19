import { describe, it, expect, vi } from "vitest";
import { DB } from "../../src/core/db.js";
import { table, column } from "../../src/schema/dsl.js";
import type { Driver, QueryResult } from "../../src/drivers/types.js";
import { PostgresDriver } from "../../src/drivers/adapters/postgres-node.js";

describe("Security Assault & Defense Tests", () => {
  const mockDriver: Driver = {
    execute: vi.fn().mockImplementation(async (query) => {
        return { rows: [] } as QueryResult;
    }),
    transaction: vi.fn().mockImplementation(async (fn) => fn(mockDriver)),
  };
  const db = new DB(mockDriver);

  const getLatestQuery = () => {
    const call = (mockDriver.execute as any).mock.calls.at(-1);
    const query = call[0];
    const sql = typeof query === "string" ? query : query.sql;
    return [sql, call[1]];
  };

  it("should block SQL injection in column names", () => {
    const users = table("users", {
      id: column.number().primary(),
      name: column.string(),
    });

    expect(() => db.select().from(users).where("name; DROP TABLE users; --", "=", "val")).toThrow();
  });

  it("should block SQL injection in table names", () => {
    expect(() => table("users; DROP TABLE users; --", { id: column.number() })).toThrow();
  });

  it("should automatically apply RLS and prevent context shadowing", async () => {
    const posts = table("posts", {
      id: column.number().primary(),
      userId: column.string(),
      title: column.string(),
    });

    await db.select()
      .from(posts)
      .where("userId", "=", "victim") // Shadowing attempt
      .withContext({ userId: "attacker" })
      .execute();

    const [sql, params] = getLatestQuery();
    // Should have BOTH filters, combined with AND
    expect(sql).toContain('WHERE (("userId" = ?) AND ("posts"."userId" = ?))');
    expect(params).toEqual(["victim", "attacker"]);
  });

  it("should prevent prototype pollution in expression building", () => {
    const users = table("users", { id: column.number() });
    const malicious = JSON.parse('{"__proto__": {"type": "column", "name": "password"}}');
    
    expect(() => db.select().from(users).where(malicious, "=", "secret")).toThrow();
  });
});
