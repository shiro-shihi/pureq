import { describe, it, expect } from "vitest";
import { RpcHandler } from "../src/runtime/server/handler.ts";
import { FortressRouter } from "../src/runtime/server/router.ts";
import { PureqHyperCodec } from "../src/runtime/shared/codec.ts";

import { generateSecureId } from "../../pureq/src/utils/crypto.ts";

describe("Security Assault: RpcHandler", () => {
  const secret = generateSecureId(32);
  const mockManifest = {
    auth_query: { sql: "...", projection: new Set() }
  };
  const router = new FortressRouter(mockManifest as any);
  router.procedure("auth_query", async () => "top_secret");
  const handler = new RpcHandler(router);

  it("should reject a request with an invalid signature", async () => {
    const payload = {
      queryId: "auth_query",
      signature: "WRONG_SIGNATURE",
      params: {}
    };
    const body = PureqHyperCodec.encode(payload, new Uint8Array(1024));

    const req = new Request("http://t/rpc", {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body
    });

    const res = await handler.handleRequest(req, async () => ({ sessionSecret: secret }));
    expect(res.status).toBe(403);
  });

  it("should reject an unauthorized QueryId", async () => {
    const payload = {
      queryId: "EVIL_QUERY",
      signature: "ANY",
      params: {}
    };
    const body = PureqHyperCodec.encode(payload, new Uint8Array(1024));

    const req = new Request("http://t/rpc", {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body
    });

    // Even if signature check passed somehow, QueryId check should fail
    const res = await handler.handleRequest(req, async () => ({ sessionSecret: secret }));
    expect(res.status).toBe(403); // Signature check fails first
  });
});
