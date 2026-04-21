import { createAuthError } from "../shared/index.js";
import type { OIDCProviderDefinition } from "../shared/index.js";

function assertNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw createAuthError("PUREQ_OIDC_INVALID_PROVIDER", `pureq: ${label} is required`, {
      details: { label },
    });
  }

  return normalized;
}

function provider(
  name: string,
  discoveryUrl: string,
  defaultScope?: readonly string[],
  authorizationDefaults?: Readonly<Record<string, string>>,
  validateAuthorizationOptions?: OIDCProviderDefinition["validateAuthorizationOptions"],
  mapProfile?: OIDCProviderDefinition["mapProfile"]
): OIDCProviderDefinition {
  return {
    name: assertNonEmpty(name, "provider name"),
    discoveryUrl: assertNonEmpty(discoveryUrl, "discovery url"),
    ...(defaultScope ? { defaultScope } : {}),
    ...(authorizationDefaults ? { authorizationDefaults } : {}),
    ...(validateAuthorizationOptions ? { validateAuthorizationOptions } : {}),
    mapProfile: mapProfile ?? ((profile) => profile),
  };
}

/**
 * Built-in OIDC provider definitions.
 * FEAT-M7: Extended with Apple, Discord, Slack, GitLab, Keycloak, Okta, Cognito, and generic.
 */
export const oidcProviders = {
  google: () =>
    provider(
      "google",
      "https://accounts.google.com/.well-known/openid-configuration",
      ["openid", "profile", "email"],
      { access_type: "offline", include_granted_scopes: "true" },
      undefined,
      (profile) => ({
        id: profile.sub,
        email: profile.email,
        name: profile.name,
        image: profile.picture,
      })
    ),
  github: () =>
    provider(
      "github",
      "https://github.com/.well-known/openid-configuration",
      ["openid", "read:user", "user:email"],
      undefined,
      undefined,
      (profile) => ({
        id: profile.id?.toString() ?? profile.sub,
        email: profile.email,
        name: profile.name ?? profile.login,
        image: profile.avatar_url ?? profile.picture,
      })
    ),
  microsoft: (tenant = "common") =>
    provider(
      "microsoft",
      `https://login.microsoftonline.com/${assertNonEmpty(tenant, "microsoft tenant")}/v2.0/.well-known/openid-configuration`,
      ["openid", "profile", "email"],
      { response_mode: "query" },
      undefined,
      (profile) => ({
        id: profile.sub,
        email: profile.email ?? profile.preferred_username,
        name: profile.name,
      })
    ),
  auth0: (domain: string) =>
    provider(
      "auth0",
      `https://${assertNonEmpty(domain, "auth0 domain").replace(/^https?:\/\//, "")}/.well-known/openid-configuration`,
      ["openid", "profile", "email"],
      undefined,
      (options) => {
        if (options.codeChallengeMethod === "plain") {
          throw createAuthError("PUREQ_OIDC_INVALID_PROVIDER", "pureq: auth0 provider requires S256 PKCE challenge method", {
            details: { provider: "auth0", codeChallengeMethod: "plain" },
          });
        }
      },
      (profile) => ({
        id: profile.sub,
        email: profile.email,
        name: profile.name,
        image: profile.picture,
      })
    ),
  apple: () =>
    provider(
      "apple",
      "https://appleid.apple.com/.well-known/openid-configuration",
      ["openid", "name", "email"],
      { response_mode: "form_post" },
      undefined,
      (profile) => ({
        id: profile.sub,
        email: profile.email,
        name: profile.name
          ? `${profile.name.firstName ?? ""} ${profile.name.lastName ?? ""}`.trim()
          : profile.email?.split("@")[0],
      })
    ),
  discord: () =>
    provider(
      "discord",
      "https://discord.com/.well-known/openid-configuration",
      ["openid", "identify", "email"],
      undefined,
      undefined,
      (profile) => ({
        id: profile.id ?? profile.sub,
        email: profile.email,
        name: profile.username,
        image: profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png` : null,
      })
    ),
  slack: () =>
    provider(
      "slack",
      "https://slack.com/.well-known/openid-configuration",
      ["openid", "profile", "email"],
      undefined,
      undefined,
      (profile) => ({
        id: profile["https://slack.com/user_id"] ?? profile.sub,
        email: profile.email,
        name: profile.name,
        image: profile.picture,
      })
    ),
  line: () =>
    provider(
      "line",
      "https://access.line.me/.well-known/openid-configuration",
      ["openid", "profile", "email"],
      undefined,
      undefined,
      (profile) => ({
        id: profile.sub,
        email: profile.email,
        name: profile.name,
        image: profile.picture,
      })
    ),
  twitch: () =>
    provider(
      "twitch",
      "https://id.twitch.tv/oauth2/.well-known/openid-configuration",
      ["openid", "user:read:email"],
      undefined,
      undefined,
      (profile) => ({
        id: profile.sub,
        email: profile.email,
        name: profile.preferred_username ?? profile.display_name,
        image: profile.picture,
      })
    ),
  linkedin: () =>
    provider(
      "linkedin",
      "https://www.linkedin.com/oauth/.well-known/openid-configuration",
      ["openid", "profile", "email"],
      undefined,
      undefined,
      (profile) => ({
        id: profile.sub,
        email: profile.email,
        name: profile.name ?? `${profile.given_name ?? ""} ${profile.family_name ?? ""}`.trim(),
        image: profile.picture,
      })
    ),
  amazon: () =>
    provider(
      "amazon",
      "https://www.amazon.com/.well-known/openid-configuration",
      ["openid", "profile"],
      undefined,
      undefined,
      (profile) => ({
        id: profile.sub,
        email: profile.email,
        name: profile.name,
      })
    ),
  facebook: () =>
    provider(
      "facebook",
      "https://www.facebook.com/.well-known/openid-configuration",
      ["openid", "public_profile", "email"],
      undefined,
      undefined,
      (profile) => ({
        id: profile.id ?? profile.sub,
        email: profile.email,
        name: profile.name,
        image: profile.picture?.data?.url ?? profile.picture,
      })
    ),
  twitter: () =>
    provider(
      "twitter",
      "https://twitter.com/.well-known/openid-configuration",
      ["openid", "tweet.read", "users.read"],
      undefined,
      undefined,
      (profile) => ({
        id: profile.data?.id ?? profile.sub,
        email: profile.email,
        name: profile.data?.name ?? profile.name,
        image: profile.data?.profile_image_url ?? profile.picture,
      })
    ),
  gitlab: (baseUrl = "https://gitlab.com") =>
    provider(
      "gitlab",
      `${assertNonEmpty(baseUrl, "gitlab base url").replace(/\/$/, "")}/.well-known/openid-configuration`,
      ["openid", "profile", "email"],
      undefined,
      undefined,
      (profile) => ({
        id: profile.sub,
        email: profile.email,
        name: profile.name ?? profile.nickname,
        image: profile.picture,
      })
    ),
  keycloak: (baseUrl: string, realm: string) =>
    provider(
      "keycloak",
      `${assertNonEmpty(baseUrl, "keycloak base url").replace(/\/$/, "")}/realms/${assertNonEmpty(realm, "keycloak realm")}/.well-known/openid-configuration`,
      ["openid", "profile", "email"],
      undefined,
      undefined,
      (profile) => ({
        id: profile.sub,
        email: profile.email,
        name: profile.name ?? profile.preferred_username,
      })
    ),
  okta: (domain: string) =>
    provider(
      "okta",
      `https://${assertNonEmpty(domain, "okta domain").replace(/^https?:\/\//, "").replace(/\/$/, "")}/.well-known/openid-configuration`,
      ["openid", "profile", "email"],
      undefined,
      undefined,
      (profile) => ({
        id: profile.sub,
        email: profile.email,
        name: profile.name,
      })
    ),
  cognito: (domain: string, region?: string) => {
    const cleanDomain = assertNonEmpty(domain, "cognito domain").replace(/^https?:\/\//, "").replace(/\/$/, "");
    const discoveryBase = region
      ? `https://cognito-idp.${region}.amazonaws.com/${cleanDomain}`
      : `https://${cleanDomain}`;
    return provider(
      "cognito",
      `${discoveryBase}/.well-known/openid-configuration`,
      ["openid", "profile", "email"],
      undefined,
      undefined,
      (profile) => ({
        id: profile.sub,
        email: profile.email,
        name: profile.name ?? profile["cognito:username"],
      })
    );
  },
  /** Generic OIDC provider — pass any discovery URL. */
  generic: (name: string, discoveryUrl: string, defaultScope?: readonly string[]) =>
    provider(
      assertNonEmpty(name, "provider name"),
      assertNonEmpty(discoveryUrl, "discovery url"),
      defaultScope ?? ["openid"]
    ),
};
