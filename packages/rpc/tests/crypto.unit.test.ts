import { describe, it, expect } from "vitest";
import { generateRequestSignature, timingSafeEqual } from "../src/runtime/shared/crypto.ts";

describe("Universal Security Core", () => {
  const secret = "top-secret-key";
  const queryId = "q_user_fetch";
  const params = new Uint8Array([1, 2, 3]);

  it("should generate a valid HMAC signature", async () => {
    const sig1 = await generateRequestSignature(secret, queryId, params);
    const sig2 = await generateRequestSignature(secret, queryId, params);
    
    expect(sig1).toBe(sig2);
    expect(sig1.length).toBe(64); // SHA-256 Hex
  });

  it("should produce different signatures for different secrets", async () => {
    const sig1 = await generateRequestSignature("secret-1", queryId, params);
    const sig2 = await generateRequestSignature("secret-2", queryId, params);
    expect(sig1).not.toBe(sig2);
  });

  it("should produce different signatures for different params", async () => {
    const sig1 = await generateRequestSignature(secret, queryId, new Uint8Array([1]));
    const sig2 = await generateRequestSignature(secret, queryId, new Uint8Array([2]));
    expect(sig1).not.toBe(sig2);
  });

  it("should verify timingSafeEqual works correctly", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});
