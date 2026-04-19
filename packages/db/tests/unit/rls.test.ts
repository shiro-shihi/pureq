import { describe, it, expect, vi } from "vitest";
import { DB } from "../../src/core/db.js";
import { table, column } from "../../src/schema/dsl.js";
import type { Driver, QueryResult } from "../../src/drivers/types.js";

describe("Row-Level Security (RLS)", () => {
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

  it("should automatically add userId filter if present in context", async () => {
    await db
      .select()
      .from(posts)
      .withContext({ userId: 123 })
      .execute();

    expect(mockDriver.execute).toHaveBeenCalledWith(
      expect.objectContaining({ sql: 'SELECT "id", "title", "userId" FROM "posts" WHERE ("posts"."userId" = ?)' }),
      [123]
    );
  });

  it("should combine RLS with existing WHERE clause", async () => {
    await db
      .select()
      .from(posts)
      .where("id", ">", 10)
      .withContext({ userId: 456 })
      .execute();

    expect(mockDriver.execute).toHaveBeenCalledWith(
      expect.objectContaining({ sql: 'SELECT "id", "title", "userId" FROM "posts" WHERE (("id" > ?) AND ("posts"."userId" = ?))' }),
      [10, 456]
    );
  });
});
