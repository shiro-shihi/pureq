import type {
  AuthProvider,
  AuthCredentialsProviderOptions,
  AuthEmailProviderOptions,
  AuthPasskeyChallenge,
  AuthPasskeyChallengeFlow,
  AuthPasskeyProviderOptions,
  AuthPasskeyChallengeStore,
  AuthPasskeyStoredChallenge,
  AuthUser,
} from "../shared/index.js";
export { createTopProviderPreset } from "./presets.js";
export { listTopProviderPresets } from "./presets.js";
export type { TopProviderPreset, TopProviderPresetOptions } from "./presets.js";
export { validateProviderCallbackContract } from "./callbackContracts.js";
export type { ProviderCallbackContractInput, ProviderCallbackContractResult } from "./callbackContracts.js";
export { normalizeProviderError, PROVIDER_ERROR_NORMALIZATION_TABLE } from "./errors.js";
export type { ProviderNormalizedError } from "./errors.js";

/**
 * FEAT-H3: Credentials-based sign-in provider.
 * Accepts a user-supplied authorize function that validates credentials and returns a user.
 */
export function credentialsProvider(options: AuthCredentialsProviderOptions): AuthProvider & {
  authorize(credentials: Readonly<Record<string, string>>): Promise<AuthUser | null>;
} {
  return {
    id: options.id ?? "credentials",
    type: "credentials",
    name: options.name ?? "Credentials",
    authorize: options.authorize,
  };
}

/**
 * FEAT-H3: Email / magic-link sign-in provider.
 * Uses a verification token flow for passwordless authentication.
 */
export function emailProvider(options: AuthEmailProviderOptions): AuthProvider & {
  sendVerificationRequest(params: { identifier: string; url: string; token: string }): Promise<void>;
} {
  return {
    id: options.id ?? "email",
    type: "email",
    name: options.name ?? "Email",
    sendVerificationRequest: options.sendVerificationRequest,
  };
}

function getCrypto(): Crypto {
  if (typeof globalThis.crypto !== "undefined") {
    return globalThis.crypto;
  }
  throw new Error("pureq: WebAuthn provider requires Web Crypto API support");
}

function randomBase64Url(bytes: number): string {
  const crypto = getCrypto();
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  let binary = "";
  for (const value of buffer) {
    binary += String.fromCharCode(value);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function defaultRegistrationOptions(params: {
  readonly challenge: string;
  readonly user: AuthUser;
  readonly excludeCredentialIds: readonly string[];
  readonly rpId: string;
  readonly timeoutMs: number;
  readonly userVerification: "required" | "preferred" | "discouraged";
}): Readonly<Record<string, unknown>> {
  return {
    challenge: params.challenge,
    rp: {
      id: params.rpId,
      name: params.rpId,
    },
    user: {
      id: params.user.id,
      name: params.user.email ?? params.user.id,
      displayName: params.user.name ?? params.user.email ?? params.user.id,
    },
    timeout: params.timeoutMs,
    attestation: "none",
    pubKeyCredParams: [
      { type: "public-key", alg: -7 },
      { type: "public-key", alg: -257 },
    ],
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: params.userVerification,
    },
    excludeCredentials: params.excludeCredentialIds.map((credentialId) => ({
      id: credentialId,
      type: "public-key",
    })),
  };
}

function defaultAuthenticationOptions(params: {
  readonly challenge: string;
  readonly allowCredentialIds: readonly string[];
  readonly rpId: string;
  readonly timeoutMs: number;
  readonly userVerification: "required" | "preferred" | "discouraged";
}): Readonly<Record<string, unknown>> {
  return {
    challenge: params.challenge,
    rpId: params.rpId,
    timeout: params.timeoutMs,
    userVerification: params.userVerification,
    allowCredentials: params.allowCredentialIds.map((credentialId) => ({
      id: credentialId,
      type: "public-key",
    })),
  };
}

/**
 * Passkey/WebAuthn provider with one-time challenge lifecycle.
 * Verification is delegated to user-supplied callbacks so callers can plug in WebAuthn server libraries.
 * By default challenges are stored in-memory (single process); pass challengeStore for shared/distributed deployments.
 */
export function passkeyProvider(options: AuthPasskeyProviderOptions): AuthProvider & {
  issueChallenge(flow: AuthPasskeyChallengeFlow, userId?: string): Promise<AuthPasskeyChallenge>;
  consumeChallenge(challengeId: string, flow: AuthPasskeyChallengeFlow, userId?: string): Promise<string | null>;
  createRegistrationOptions(params: {
    user: AuthUser;
    challenge: string;
    excludeCredentialIds: readonly string[];
  }): Promise<Readonly<Record<string, unknown>>>;
  verifyRegistration: AuthPasskeyProviderOptions["verifyRegistration"];
  createAuthenticationOptions(params: {
    challenge: string;
    allowCredentialIds: readonly string[];
  }): Promise<Readonly<Record<string, unknown>>>;
  verifyAuthentication: AuthPasskeyProviderOptions["verifyAuthentication"];
  readonly rpId: string;
  readonly expectedOrigin: string;
} {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const challengeTtlMs = options.challengeTtlMs ?? 5 * 60_000;
  const userVerification = options.userVerification ?? "required";
  // Default in-process challenge store. This keeps previous behavior of pendingChallenges + purgeExpired.
  const pendingChallenges = new Map<string, AuthPasskeyStoredChallenge>();

  const purgeExpired = async (): Promise<void> => {
    if (options.challengeStore?.cleanup) {
      await options.challengeStore.cleanup(Date.now());
      return;
    }
    const now = Date.now();
    for (const [challengeId, challenge] of pendingChallenges.entries()) {
      if (challenge.expiresAt <= now) {
        pendingChallenges.delete(challengeId);
      }
    }
  };

  const inMemoryStore: AuthPasskeyChallengeStore = {
    get(challengeId) {
      return pendingChallenges.get(challengeId) ?? null;
    },
    set(challenge) {
      pendingChallenges.set(challenge.challengeId, challenge);
    },
    delete(challengeId) {
      pendingChallenges.delete(challengeId);
    },
  };

  const challengeStore = options.challengeStore ?? inMemoryStore;

  return {
    id: options.id ?? "passkey",
    type: "webauthn",
    name: options.name ?? "Passkey",
    rpId: options.rpId,
    expectedOrigin: options.expectedOrigin,
    async issueChallenge(flow, userId) {
      await purgeExpired();
      const challengeId = randomBase64Url(18);
      const challenge = randomBase64Url(32);
      await challengeStore.set({
        challengeId,
        challenge,
        flow,
        ...(userId ? { userId } : {}),
        expiresAt: Date.now() + challengeTtlMs,
      });
      return { challengeId, challenge };
    },
    async consumeChallenge(challengeId, flow, userId) {
      await purgeExpired();
      const challenge = await challengeStore.get(challengeId);
      if (!challenge) {
        return null;
      }

      await challengeStore.delete(challengeId);
      if (challenge.flow !== flow) {
        return null;
      }
      if (challenge.userId && (!userId || challenge.userId !== userId)) {
        return null;
      }
      if (challenge.expiresAt <= Date.now()) {
        return null;
      }
      return challenge.challenge;
    },
    async createRegistrationOptions(params) {
      if (options.createRegistrationOptions) {
        return options.createRegistrationOptions({
          challenge: params.challenge,
          user: params.user,
          excludeCredentialIds: params.excludeCredentialIds,
          rpId: options.rpId,
          timeoutMs,
          userVerification,
        });
      }
      return defaultRegistrationOptions({
        challenge: params.challenge,
        user: params.user,
        excludeCredentialIds: params.excludeCredentialIds,
        rpId: options.rpId,
        timeoutMs,
        userVerification,
      });
    },
    verifyRegistration: options.verifyRegistration,
    async createAuthenticationOptions(params) {
      if (options.createAuthenticationOptions) {
        return options.createAuthenticationOptions({
          challenge: params.challenge,
          allowCredentialIds: params.allowCredentialIds,
          rpId: options.rpId,
          timeoutMs,
          userVerification,
        });
      }
      return defaultAuthenticationOptions({
        challenge: params.challenge,
        allowCredentialIds: params.allowCredentialIds,
        rpId: options.rpId,
        timeoutMs,
        userVerification,
      });
    },
    verifyAuthentication: options.verifyAuthentication,
  };
}

export type {
  AuthProvider,
  AuthCredentialsProviderOptions,
  AuthEmailProviderOptions,
  AuthPasskeyChallengeFlow,
  AuthPasskeyCredential,
  AuthPasskeyProviderOptions,
} from "../shared/index.js";
