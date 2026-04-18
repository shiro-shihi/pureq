import type { AuthProvider, AuthCredentialsProviderOptions, AuthEmailProviderOptions, AuthUser } from "../shared/index.js";
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

export type { AuthProvider, AuthCredentialsProviderOptions, AuthEmailProviderOptions } from "../shared/index.js";
