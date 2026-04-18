import { describe, it, expect, vi } from "vitest";
import { DB } from "../../src/core/db.js";
import { table, column } from "../../src/schema/dsl.js";
import type { Driver, QueryResult } from "../../src/drivers/types.js";

describe("Policy Push-down", () => {
  const users = table("users", {
    id: column.number().primary(),
    name: column.string(),
    email: column.string().policy({ scope: ["admin"] }),
    salary: column.number().policy({ scope: ["hr"] }),
  });

  const mockDriver: Driver = {
    execute: vi.fn().mockResolvedValue({ rows: [] } as QueryResult),
    transaction: vi.fn(),
  };

  const db = new DB(mockDriver);

  it("should filter columns based on user scopes (admin only)", async () => {
    await db
      .select()
      .from(users)
      .withContext({ scopes: ["admin"] })
      .execute();

    // salary should be removed because user doesn't have 'hr' scope
    expect(mockDriver.execute).toHaveBeenCalledWith(
      "SELECT id, name, email FROM users",
      []
    );
  });

  it("should filter columns based on user scopes (hr only)", async () => {
    await db
      .select()
      .from(users)
      .withContext({ scopes: ["hr"] })
      .execute();

    // email should be removed because user doesn't have 'admin' scope
    expect(mockDriver.execute).toHaveBeenCalledWith(
      "SELECT id, name, salary FROM users",
      []
    );
  });

  it("should return all columns for superuser", async () => {
    await db
      .select()
      .from(users)
      .withContext({ scopes: ["admin", "hr"] })
      .execute();

    expect(mockDriver.execute).toHaveBeenCalledWith(
      "SELECT id, name, email, salary FROM users",
      []
    );
  });

  it("should handle explicit column selection with policies", async () => {
    await db
      .select(["email", "name"])
      .from(users)
      .withContext({ scopes: [] }) // No scopes
      .execute();

    // email should be filtered out even if explicitly requested, if no scope matches
    expect(mockDriver.execute).toHaveBeenCalledWith(
      "SELECT id, name FROM users",
      []
    );
  });
});
