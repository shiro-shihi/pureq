import { describe, it, expect, vi } from "vitest";
import { DB } from "../../src/core/db.js";
import { table, column, belongsTo } from "../../src/schema/dsl.js";
import type { Driver, QueryResult } from "../../src/drivers/types.js";

describe("Relations & JSON Querying", () => {
  const users = table("users", {
    id: column.number().primary(),
    name: column.string(),
  });

  const posts = table("posts", {
    id: column.number().primary(),
    title: column.string(),
    authorId: column.number(),
    metadata: column.json(),
  }, {
    relations: {
      author: belongsTo(users, "authorId")
    }
  });

  const mockDriver: Driver = {
    execute: vi.fn().mockResolvedValue({ 
      rows: [
        { 
          id: 1, 
          title: "Hello", 
          authorId: 10,
          __author__id: 10,
          __author__name: "Alice"
        }
      ] 
    } as QueryResult),
    transaction: vi.fn(),
  };
  const db = new DB(mockDriver);

  it("should eagerly load relations and structure the result", async () => {
    const results = await db.select()
      .from(posts)
      .with("author")
      .execute();

    expect(results[0]).toEqual({
      id: 1,
      title: "Hello",
      authorId: 10,
      author: {
        id: 10,
        name: "Alice"
      }
    });
    
    const [sql] = (mockDriver.execute as any).mock.calls.at(-1);
    expect(sql).toContain('INNER JOIN "users" ON ("posts"."authorId" = "users"."id")');
    expect(sql).toContain('AS "__author__id"');
    expect(sql).toContain('AS "__author__name"');
  });

  it("should safely query JSON fields using .at()", async () => {
    await db.select()
      .from(posts)
      .where(posts.columns.metadata.at("tags.category"), "=", "tech")
      .execute();

    const [sql, params] = (mockDriver.execute as any).mock.calls.at(-1);
    // posts.columns.metadata.at("tags.category") -> ("metadata" ->> ?)
    expect(sql).toContain('("metadata" ->> ?)');
    expect(params).toContain("tags.category");
    expect(params).toContain("tech");
  });
});
