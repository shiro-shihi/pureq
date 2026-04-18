import { describe, it, expect, vi } from "vitest";
import { DB } from "../../src/core/db.js";
import { table, column } from "../../src/schema/dsl.js";
import type { Driver, QueryResult } from "../../src/drivers/types.js";

describe("Generic Row-Level Security (RLS)", () => {
  const mockDriver: Driver = {
    execute: vi.fn().mockResolvedValue({ rows: [] } as QueryResult),
    transaction: vi.fn(),
  };
  const db = new DB(mockDriver);

  it("should apply generic RLS policy from table options using helpers", async () => {
    const orgs = table("organizations", {
      id: column.number().primary(),
      name: column.string(),
    }, {
      policy: {
        rls: (ctx, { eq }) => eq("id", ctx.orgId)
      }
    });

    await db.select()
      .from(orgs)
      .withContext({ orgId: 999 })
      .execute();

    expect(mockDriver.execute).toHaveBeenCalledWith(
      expect.stringContaining('WHERE ("id" = ?)'),
      [999]
    );
  });

  it("should combine generic RLS with manual where clause", async () => {
    const items = table("items", {
      id: column.number().primary(),
      name: column.string(),
      status: column.string(),
    }, {
      policy: {
        rls: (ctx) => ({
          type: "binary",
          left: { type: "column", name: "status" },
          operator: "=",
          right: { type: "literal", value: "active" }
        })
      }
    });

    await db.select()
      .from(items)
      .where("id", ">", 100)
      .withContext({})
      .execute();

    const [sql, params] = (mockDriver.execute as any).mock.calls.at(-1);
    expect(sql).toContain('WHERE (("id" > ?) AND ("status" = ?))');
    expect(params).toEqual([100, "active"]);
  });
});
