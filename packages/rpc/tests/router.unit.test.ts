import { describe, it, expect } from "vitest";
import { FortressRouter } from "../src/runtime/server/router.ts";
import { QueryManifest } from "../src/runtime/shared/types.ts";

describe("FortressRouter (Server Core)", () => {
  const mockManifest: QueryManifest = {
    q1: { sql: "SELECT 1", projection: new Set() }
  };

  it("should register authorized procedures", () => {
    const router = new FortressRouter(mockManifest);
    const handler = async ({ input }: any) => "ok";
    
    router.procedure("q1", handler);
    expect(router.procedureHandlers["q1"]).toBe(handler);
  });

  it("should block unauthorized query registration", () => {
    const router = new FortressRouter(mockManifest);
    expect(() => {
        router.procedure("evil_query", async () => "bad");
    }).toThrow(/not in manifest/);
  });
});
