import { describe, expect, it } from "vitest";
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

    expect(registrationOptions).toMatchObject({
      challenge: "challenge-1",
      attestation: "none",
      authenticatorSelection: {
        userVerification: "required",
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
});
