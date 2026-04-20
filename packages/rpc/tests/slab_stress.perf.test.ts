import { describe, it, expect } from "vitest";
import { PureqHyperCodec } from "../src/runtime/shared/codec.ts";

describe("Slab Allocator (Stress Test)", () => {
  it("should handle large allocations and resets without corruption", () => {
    const slab = new Uint8Array(1024 * 1024); // 1MB

    // Encode a very large object
    const largeObj = {
      data: new Array(1000).fill(0).map((_, i) => ({ id: i, text: "Repeated string to test slab write overhead" }))
    };

    const encoded = PureqHyperCodec.encode(largeObj, slab);
    expect(encoded.length).toBeGreaterThan(50000);
    
    const decoded = PureqHyperCodec.decode(encoded);
    expect(decoded.data.length).toBe(1000);
    expect(decoded.data[999].id).toBe(999);

    // Reuse slab immediately
    const smallObj = { status: "ok" };
    const encodedSmall = PureqHyperCodec.encode(smallObj, slab);
    const decodedSmall = PureqHyperCodec.decode(encodedSmall);
    expect(decodedSmall.status).toBe("ok");
  });
});
