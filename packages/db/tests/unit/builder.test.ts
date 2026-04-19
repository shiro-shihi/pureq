import { describe, it, expect, vi, beforeEach } from "vitest";
import { DB } from "../../src/core/db.js";
import { table, column } from "../../src/schema/dsl.js";
import type { Driver, QueryResult } from "../../src/drivers/types.js";

describe("Query Builder", () => {
  const users = table("users", {
    id: column.uuid().primary(),
    name: column.string(),
    age: column.number().nullable(),
  });

  const mockDriver: Driver = {
    execute: vi.fn().mockResolvedValue({ rows: [] } as QueryResult),
    transaction: vi.fn(),
  };

  const db = new DB(mockDriver);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should build a simple select query with quoted identifiers", async () => {
    await db.select().from(users).where("name", "=", "John").limit(10).execute();

    expect(mockDriver.execute).toHaveBeenCalledWith(
      expect.objectContaining({ sql: 'SELECT * FROM "users" WHERE ("name" = ?) LIMIT 10' }),
      ["John"]
    );
  });

  it("should build a complex select query with quoted identifiers", async () => {
    await db
      .select()
      .from(users)
      .where("name", "=", "John")
      .where("age", ">", 18)
      .orderBy("name", "DESC")
      .execute();

    expect(mockDriver.execute).toHaveBeenCalledWith(
      expect.objectContaining({ sql: 'SELECT * FROM "users" WHERE (("name" = ?) AND ("age" > ?)) ORDER BY "name" DESC' }),
      ["John", 18]
    );
  });

  it("should validate query results", async () => {
    const mockData = [{ id: "u1", name: "John", age: 30 }];
    (mockDriver.execute as any).mockResolvedValueOnce({ rows: mockData });

    const results = await db.select().from(users).validate().execute();

    expect(results).toEqual(mockData);
  });

  it("should throw error when validation fails", async () => {
    const mockData = [{ id: "u1", name: 123, age: "wrong" }];
    (mockDriver.execute as any).mockResolvedValueOnce({ rows: mockData });

    await expect(db.select().from(users).validate().execute()).rejects.toThrow(
      "Validation failed"
    );
  });

  it("should build an insert query with quoted identifiers", async () => {
    await db.insert(users).values({ name: "Alice", age: 25 }).execute();

    expect(mockDriver.execute).toHaveBeenCalledWith(
      expect.objectContaining({ sql: 'INSERT INTO "users" ("name", "age") VALUES (?, ?)' }),
      ["Alice", 25]
    );
  });

  it("should build an update query with quoted identifiers", async () => {
    await db
      .update(users)
      .set({ age: 26 })
      .where("name", "=", "Alice")
      .execute();

    expect(mockDriver.execute).toHaveBeenCalledWith(
      expect.objectContaining({ sql: 'UPDATE "users" SET "age" = ? WHERE ("name" = ?)' }),
      [26, "Alice"]
    );
  });

  it("should build a delete query with quoted identifiers", async () => {
    await db.delete(users).where("age", "<", 18).execute();

    expect(mockDriver.execute).toHaveBeenCalledWith(
      expect.objectContaining({ sql: 'DELETE FROM "users" WHERE ("age" < ?)' }),
      [18]
    );
  });

  it("should apply PII masking and hide redaction", async () => {
    const sensitive = table("sensitive", {
      id: column.number().primary(),
      email: column.string().policy({ pii: true, redact: "mask" }),
      secret: column.string(),
    });

    await db.select().from(sensitive).withContext({ scopes: [] }).execute();

    expect(mockDriver.execute).toHaveBeenCalledWith(
      expect.objectContaining({ sql: 'SELECT "id", (SUBSTR("sensitive"."email", ?, ?) || ?), "secret" FROM "sensitive"' }),
      [1, 3, "***"]
    );
  });
});
