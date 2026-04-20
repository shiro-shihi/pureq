import { describe, it, expect, vi } from "vitest";
import { defineManifest } from "../src/runtime/shared/manifest.ts";
import { FortressRouter } from "../src/runtime/server/router.ts";
import { RpcHandler } from "../src/runtime/server/handler.ts";
import { createPureqClient } from "../src/runtime/client/proxy.ts";

describe("Pureq RPC (Full E2E Flow)", () => {
  const secret = "e2e-secret";

  it("should complete a full manifest -> server -> client cycle", async () => {
    // 1. Define Manifest
    const manifest = defineManifest({
      hello: { sql: "SELECT 1", selectedFields: [] }
    });

    // 2. Setup Router & Handler
    const router = new FortressRouter(manifest);
    router.procedure("hello", async ({ input }) => {
      return { message: `Hello ${input.name}!` };
    });
    const handler = new RpcHandler({ router });

    // 3. Mock Network
    vi.stubGlobal("fetch", async (url: string, options: any) => {
      const mockRequest = new Request(url, options);
      const response = await handler.handleRequest(mockRequest, async () => ({
        sessionSecret: secret
      }));
      return response;
    });

    // 4. Client Call
    const client = createPureqClient<any>({
      url: "http://e2e/rpc",
      getSessionSecret: () => secret
    });

    const result = await client.hello({ name: "Pureq" });

    // 5. Verify result
    expect(result.message).toBe("Hello Pureq!");
  });
});
