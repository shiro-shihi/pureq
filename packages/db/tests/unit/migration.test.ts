import { describe, it, expect, vi, beforeEach } from "vitest";
import { DB } from "../../src/core/db.js";
import { MigrationManager, type Migration } from "../../src/migration/index.js";
import type { Driver, QueryResult } from "../../src/drivers/types.js";

describe("MigrationManager", () => {
  let mockDriver: Driver;
  let db: DB;
  let manager: MigrationManager;

  beforeEach(() => {
    mockDriver = {
      execute: vi.fn().mockImplementation(async (sql) => {
        if (sql.includes("SELECT id FROM _pureq_migrations")) {
          return { rows: [] } as QueryResult;
        }
        return { rows: [] } as QueryResult;
      }),
      transaction: vi.fn().mockImplementation(async (fn) => fn(mockDriver)),
    };
    db = new DB(mockDriver);
    manager = new MigrationManager(db);
  });

  it("should setup migrations table", async () => {
    await manager.setup();
    expect(mockDriver.execute).toHaveBeenCalledWith(expect.stringContaining("CREATE TABLE IF NOT EXISTS _pureq_migrations"));
  });

  it("should apply pending migrations", async () => {
    const migrations: Migration[] = [
      {
        id: "20240101_init",
        timestamp: 1,
        up: vi.fn().mockResolvedValue(undefined),
      },
      {
        id: "20240102_add_profile",
        timestamp: 2,
        up: vi.fn().mockResolvedValue(undefined),
      }
    ];

    await manager.apply(migrations);

    expect(migrations[0].up).toHaveBeenCalled();
    expect(migrations[1].up).toHaveBeenCalled();
    expect(mockDriver.execute).toHaveBeenCalledWith(
      "INSERT INTO _pureq_migrations (id, timestamp) VALUES (?, ?)",
      ["20240101_init", 1]
    );
    expect(mockDriver.execute).toHaveBeenCalledWith(
      "INSERT INTO _pureq_migrations (id, timestamp) VALUES (?, ?)",
      ["20240102_add_profile", 2]
    );
  });

  it("should skip already applied migrations", async () => {
    (mockDriver.execute as any).mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT id FROM _pureq_migrations")) {
        return { rows: [{ id: "20240101_init" }] };
      }
      return { rows: [] };
    });

    const migrations: Migration[] = [
      {
        id: "20240101_init",
        timestamp: 1,
        up: vi.fn().mockResolvedValue(undefined),
      },
      {
        id: "20240102_add_profile",
        timestamp: 2,
        up: vi.fn().mockResolvedValue(undefined),
      }
    ];

    await manager.apply(migrations);

    expect(migrations[0].up).not.toHaveBeenCalled();
    expect(migrations[1].up).toHaveBeenCalled();
  });
});
