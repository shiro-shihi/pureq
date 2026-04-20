import { describe, it, expect } from "vitest";
import { defineManifest } from "../src/runtime/shared/manifest.ts";

describe("Sealed Manifest Engine", () => {
  it("should extract projection and sql from mock query objects", () => {
    const mockQuery = {
      sql: "SELECT id, name FROM users",
      selectedFields: ["id", "name"],
      inputSchema: { parse: (v: any) => v }
    };

    const manifest = defineManifest({
      getUser: mockQuery
    });

    expect(manifest.getUser).toBeDefined();
    expect(manifest.getUser!.sql).toBe(mockQuery.sql);
    expect(manifest.getUser!.projection).toContain("id");
    expect(manifest.getUser!.projection).toContain("name");
    expect(manifest.getUser!.projection.size).toBe(2);
  });

  it("should handle empty projections", () => {
    const manifest = defineManifest({
      ping: { sql: "SELECT 1" }
    });
    expect(manifest.ping!.projection.size).toBe(0);
  });
});
