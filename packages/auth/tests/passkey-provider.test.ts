import { describe, expect, it, vi } from "vitest";
import { passkeyProvider } from "../src/providers";

describe("passkeyProvider", () => {
  it("issues one-time challenges and enforces flow/user binding", async () => {
    const provider = passkeyProvider({
      rpId: "app.example.com",
      expectedOrigin: "https://app.example.com",
      verifyRegistration: async () => ({ verified: true }),
      verifyAuthentication: async () => ({ verified: true }),
    });

    const challenge = await provider.issueChallenge("registration", "user-1");
    const consumed = await provider.consumeChallenge(challenge.challengeId, "registration", "user-1");
    expect(consumed).toBe(challenge.challenge);

    const replay = await provider.consumeChallenge(challenge.challengeId, "registration", "user-1");
    expect(replay).toBeNull();

    const otherFlow = await provider.issueChallenge("authentication", "user-1");
    await expect(provider.consumeChallenge(otherFlow.challengeId, "registration", "user-1")).resolves.toBeNull();

    const otherUser = await provider.issueChallenge("registration", "user-1");
    await expect(provider.consumeChallenge(otherUser.challengeId, "registration", "user-2")).resolves.toBeNull();

    const missingUser = await provider.issueChallenge("registration", "user-1");
    await expect(provider.consumeChallenge(missingUser.challengeId, "registration")).resolves.toBeNull();
  });

  it("builds secure registration/authentication options by default", async () => {
    const provider = passkeyProvider({
      rpId: "app.example.com",
      expectedOrigin: "https://app.example.com",
      verifyRegistration: async () => ({ verified: true }),
      verifyAuthentication: async () => ({ verified: true }),
    });

    const registrationOptions = await provider.createRegistrationOptions({
      challenge: "challenge-1",
      user: {
        id: "u1",
        email: "u1@example.com",
        name: "User One",
      },
      excludeCredentialIds: ["cred-1"],
    });

    const fallbackRegistrationOptions = await provider.createRegistrationOptions({
      challenge: "challenge-1b",
      user: {
        id: "u2",
      },
      excludeCredentialIds: [],
    });

    expect(registrationOptions).toMatchObject({
      challenge: "challenge-1",
      attestation: "none",
      authenticatorSelection: {
        userVerification: "required",
      },
    });
    expect(fallbackRegistrationOptions).toMatchObject({
      challenge: "challenge-1b",
      user: {
        name: "u2",
        displayName: "u2",
      },
    });

    const authenticationOptions = await provider.createAuthenticationOptions({
      challenge: "challenge-2",
      allowCredentialIds: ["cred-1"],
    });

    expect(authenticationOptions).toMatchObject({
      challenge: "challenge-2",
      rpId: "app.example.com",
      userVerification: "required",
    });
  });

  it("expires challenges by ttl", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const provider = passkeyProvider({
      rpId: "app.example.com",
      expectedOrigin: "https://app.example.com",
      challengeTtlMs: 10,
      verifyRegistration: async () => ({ verified: true }),
      verifyAuthentication: async () => ({ verified: true }),
    });

    const challenge = await provider.issueChallenge("registration", "user-1");
    vi.setSystemTime(new Date("2026-01-01T00:00:00.050Z"));

    await expect(provider.consumeChallenge(challenge.challengeId, "registration", "user-1")).resolves.toBeNull();
    vi.useRealTimers();
  });

  it("supports async external challenge store", async () => {
    const store = new Map<string, { challengeId: string; challenge: string; flow: "registration" | "authentication"; userId?: string; expiresAt: number }>();
    const provider = passkeyProvider({
      rpId: "app.example.com",
      expectedOrigin: "https://app.example.com",
      challengeStore: {
        get: async (challengeId) => store.get(challengeId) ?? null,
        set: async (challenge) => {
          store.set(challenge.challengeId, challenge);
        },
        delete: async (challengeId) => {
          store.delete(challengeId);
        },
        cleanup: async (nowMs) => {
          for (const [challengeId, challenge] of store.entries()) {
            if (challenge.expiresAt <= nowMs) {
              store.delete(challengeId);
            }
          }
        },
      },
      verifyRegistration: async () => ({ verified: true }),
      verifyAuthentication: async () => ({ verified: true }),
    });

    const challenge = await provider.issueChallenge("authentication", "user-1");
    const consumed = await provider.consumeChallenge(challenge.challengeId, "authentication", "user-1");
    expect(consumed).toBe(challenge.challenge);
  });

  it("allows challenge consumption without user binding when challenge was issued without userId", async () => {
    const provider = passkeyProvider({
      rpId: "app.example.com",
      expectedOrigin: "https://app.example.com",
      verifyRegistration: async () => ({ verified: true }),
      verifyAuthentication: async () => ({ verified: true }),
    });

    const challenge = await provider.issueChallenge("authentication");
    await expect(provider.consumeChallenge(challenge.challengeId, "authentication")).resolves.toBe(challenge.challenge);
  });

  it("uses custom option builders when provided", async () => {
    const customRegistration = vi.fn(async () => ({ mode: "custom-registration" }));
    const customAuthentication = vi.fn(async () => ({ mode: "custom-authentication" }));

    const provider = passkeyProvider({
      rpId: "app.example.com",
      expectedOrigin: "https://app.example.com",
      createRegistrationOptions: customRegistration,
      createAuthenticationOptions: customAuthentication,
      verifyRegistration: async () => ({ verified: true }),
      verifyAuthentication: async () => ({ verified: true }),
    });

    const registration = await provider.createRegistrationOptions({
      challenge: "c1",
      user: { id: "u1", email: "u1@example.com" },
      excludeCredentialIds: ["cred-1"],
    });
    const authentication = await provider.createAuthenticationOptions({
      challenge: "c2",
      allowCredentialIds: ["cred-1"],
    });

    expect(customRegistration).toHaveBeenCalledTimes(1);
    expect(customAuthentication).toHaveBeenCalledTimes(1);
    expect(registration).toEqual({ mode: "custom-registration" });
    expect(authentication).toEqual({ mode: "custom-authentication" });
  });

  it("rejects expired challenge when store does not auto-clean", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const store = new Map<string, { challengeId: string; challenge: string; flow: "registration" | "authentication"; userId?: string; expiresAt: number }>();
    const provider = passkeyProvider({
      rpId: "app.example.com",
      expectedOrigin: "https://app.example.com",
      challengeTtlMs: 10,
      challengeStore: {
        get: (challengeId) => store.get(challengeId) ?? null,
        set: (challenge) => {
          store.set(challenge.challengeId, challenge);
        },
        delete: (challengeId) => {
          store.delete(challengeId);
        },
      },
      verifyRegistration: async () => ({ verified: true }),
      verifyAuthentication: async () => ({ verified: true }),
    });

    const challenge = await provider.issueChallenge("authentication", "user-1");
    vi.setSystemTime(new Date("2026-01-01T00:00:00.050Z"));
    await expect(provider.consumeChallenge(challenge.challengeId, "authentication", "user-1")).resolves.toBeNull();

    vi.useRealTimers();
  });

  it("throws when Web Crypto API is not available", async () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    try {
      const provider = passkeyProvider({
        rpId: "app.example.com",
        expectedOrigin: "https://app.example.com",
        verifyRegistration: async () => ({ verified: true }),
        verifyAuthentication: async () => ({ verified: true }),
      });

      await expect(provider.issueChallenge("registration", "user-1")).rejects.toThrow(/Web Crypto API support/);
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        value: original,
        writable: true,
        configurable: true,
      });
    }
  });
});
