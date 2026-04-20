import { describe, it, expect, vi } from "vitest";
import { RpcHandler } from "../src/runtime/server/handler.ts";
import { FortressRouter } from "../src/runtime/server/router.ts";
import { PureqHyperCodec } from "../src/runtime/shared/codec.ts";
import { generateRequestSignature } from "../src/runtime/shared/crypto.ts";

describe("RpcHandler (Integration)", () => {
  const secret = "test-secret";
  const mockManifest = {
    ping: { sql: "SELECT 1", projection: new Set<string>() }
  };
  const router = new FortressRouter(mockManifest as any);
  router.procedure("ping", async () => ({ pong: true }));
  const handler = new RpcHandler({ router });

  it("should handle a valid binary request", async () => {
    const params = { hello: "world" };
    const slab = new Uint8Array(256 * 1024);
    const paramsBinary = PureqHyperCodec.encode(params, slab);
    const signature = await generateRequestSignature(secret, "ping", paramsBinary);

    const requestPayload = { queryId: "ping", signature, params };
    const body = PureqHyperCodec.encode(requestPayload, slab);

    const mockRequest = new Request("http://localhost/rpc", {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: body as any
    });

    const response = await handler.handleRequest(mockRequest, async () => ({
      sessionSecret: secret
    }));

    expect(response.status).toBe(200);
    const resBuffer = await response.arrayBuffer();
    const result = PureqHyperCodec.decode(new Uint8Array(resBuffer));
    expect(result.pong).toBe(true);
  });
});
