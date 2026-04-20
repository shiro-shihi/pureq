import { describe, it, expect, vi } from "vitest";
import { createPureqClient } from "../src/runtime/client/proxy.ts";
import { PureqHyperCodec } from "../src/runtime/shared/codec.ts";

describe("Sealed Client Proxy", () => {
  it("should generate a request and decode a binary response", async () => {
    const mockResponseData = { id: 1, name: "Alice" };
    const slab = new Uint8Array(256 * 1024);
    const mockResponseBody = PureqHyperCodec.encode(mockResponseData, slab);

    // Mock global fetch
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/octet-stream" }),
      arrayBuffer: async () => mockResponseBody.buffer
    });
    vi.stubGlobal("fetch", mockFetch);

    const client = createPureqClient<any>({
      url: "http://test/rpc",
      getSessionSecret: () => "secret"
    });

    const result = await client.getUser({ id: 1 });

    expect(result).toEqual(mockResponseData);
    expect(mockFetch).toHaveBeenCalled();
    
    const callArgs = mockFetch.mock.calls[0];
    const requestOptions = callArgs[1];
    expect(requestOptions.headers["content-type"]).toBe("application/octet-stream");
  });
});
