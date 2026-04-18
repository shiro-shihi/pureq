import { describe, it, expect, vi } from "vitest";
import { DB } from "../../src/core/db.js";
import { table, column } from "../../src/schema/dsl.js";
import type { Driver, QueryResult } from "../../src/drivers/types.js";

describe("Query Builder - JOIN", () => {
  const users = table("users", {
    id: column.number().primary(),
    name: column.string(),
  });

  const posts = table("posts", {
    id: column.number().primary(),
    title: column.string(),
    userId: column.number(),
  });

  const mockDriver: Driver = {
    execute: vi.fn().mockResolvedValue({ rows: [] } as QueryResult),
    transaction: vi.fn(),
  };

  const db = new DB(mockDriver);

  it("should build a simple inner join", async () => {
    await db
      .select()
      .from(users)
      .innerJoin("posts", posts, ({ base, joined }) => ({
        type: "binary",
        left: { type: "column", name: "id", table: base.name },
        operator: "=",
        right: { type: "column", name: "userId", table: joined.name }
      }))
      .execute();

    expect(mockDriver.execute).toHaveBeenCalledWith(
      'SELECT "users"."id" AS "__users__id", "users"."name" AS "__users__name", "posts"."id" AS "__posts__id", "posts"."title" AS "__posts__title", "posts"."userId" AS "__posts__userId" FROM "users" INNER JOIN "posts" ON ("users"."id" = "posts"."userId")',
      []
    );
  });
});
