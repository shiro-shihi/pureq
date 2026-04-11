import { afterEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { decrypt, encrypt, generateSecureId } from "../src/utils/crypto";

describe("crypto utils", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("applies prefix even when randomUUID is available", () => {
    const randomUUID = vi.fn(() => "123e4567-e89b-12d3-a456-426614174000");
    vi.stubGlobal("crypto", {
      randomUUID,
    } as unknown as Crypto);

    const id = generateSecureId("pureq");

    expect(id).toBe("pureq-123e4567-e89b-12d3-a456-426614174000");
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it("round-trips encrypt/decrypt with AES-GCM key", async () => {
    vi.stubGlobal("crypto", webcrypto as unknown as Crypto);

    const key = await globalThis.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
    const input = JSON.stringify({ userId: "u1", roles: ["admin"] });

    const encrypted = await encrypt(input, key);
    const decrypted = await decrypt(encrypted, key);

    expect(encrypted.includes(":")).toBe(true);
    expect(decrypted).toBe(input);
  });

  it("throws helpful error for invalid encrypted format", async () => {
    vi.stubGlobal("crypto", webcrypto as unknown as Crypto);

    const key = await globalThis.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);

    await expect(decrypt("not-valid", key)).rejects.toThrow("pureq: invalid encrypted data format");
  });
});
