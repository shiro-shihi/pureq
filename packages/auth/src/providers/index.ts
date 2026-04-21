import type { 
  AuthProvider, 
  AuthUser,
  AuthCredentialsProviderOptions,
  AuthEmailProviderOptions 
} from "../shared/index.js";

export { OAuthProvider } from "./oauth.js";

export { GithubProvider } from "./github.js";
export type { GithubProfile } from "./github.js";
export { GoogleProvider } from "./google.js";
export type { GoogleProfile } from "./google.js";
export { AppleProvider } from "./apple.js";
export type { AppleProfile } from "./apple.js";
export { FacebookProvider } from "./facebook.js";
export type { FacebookProfile } from "./facebook.js";
export { MicrosoftProvider } from "./microsoft.js";
export type { MicrosoftProfile } from "./microsoft.js";
export { TwitterProvider } from "./twitter.js";
export type { TwitterProfile } from "./twitter.js";
export { DiscordProvider } from "./discord.js";
export type { DiscordProfile } from "./discord.js";
export { OktaProvider } from "./okta.js";
export type { OktaProfile } from "./okta.js";
export { Auth0Provider } from "./auth0.js";
export type { Auth0Profile } from "./auth0.js";
export { SlackProvider } from "./slack.js";
export type { SlackProfile } from "./slack.js";
export { LineProvider } from "./line.js";
export type { LineProfile } from "./line.js";
export { TwitchProvider } from "./twitch.js";
export type { TwitchProfile } from "./twitch.js";
export { LinkedinProvider } from "./linkedin.js";
export type { LinkedinProfile } from "./linkedin.js";
export { GitlabProvider } from "./gitlab.js";
export type { GitlabProfile } from "./gitlab.js";
export { AmazonProvider } from "./amazon.js";
export type { AmazonProfile } from "./amazon.js";

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
