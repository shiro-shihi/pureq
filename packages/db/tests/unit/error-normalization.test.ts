import { describe, it, expect, vi } from "vitest";
import { PostgresDriver } from "../../src/drivers/postgres.js";
import { DBError } from "../../src/errors/db-error.js";

describe("Error Normalization (Postgres)", () => {
  it("should normalize unique constraint violation", async () => {
    const mockClient = {
      query: vi.fn().mockRejectedValue({
        code: "23505",
        message: "duplicate key value violates unique constraint"
      })
    };
    const driver = new PostgresDriver(mockClient as any);

    try {
      await driver.execute("INSERT...");
    } catch (e: any) {
      expect(e).toBeInstanceOf(DBError);
      expect(e.code).toBe("UNIQUE_VIOLATION");
      expect(e.retryable).toBe(false);
    }
  });

  it("should normalize connection failure as retryable", async () => {
    const mockClient = {
      query: vi.fn().mockRejectedValue({
        code: "57P01",
        message: "admin shutdown"
      })
    };
    const driver = new PostgresDriver(mockClient as any);

    try {
      await driver.execute("SELECT...");
    } catch (e: any) {
      expect(e).toBeInstanceOf(DBError);
      expect(e.code).toBe("CONNECTION_FAILURE");
      expect(e.retryable).toBe(true);
    }
  });

  it("should wrap unknown errors", async () => {
    const mockClient = {
      query: vi.fn().mockRejectedValue(new Error("Something went wrong"))
    };
    const driver = new PostgresDriver(mockClient as any);

    try {
      await driver.execute("SELECT...");
    } catch (e: any) {
      expect(e).toBeInstanceOf(DBError);
      expect(e.code).toBe("UNKNOWN_ERROR");
    }
  });
});
