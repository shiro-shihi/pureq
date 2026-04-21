import { oidcProviders } from "../oidc/providers.js";
import { createAuthError } from "../shared/index.js";
import type { OIDCProviderDefinition } from "../shared/index.js";

const TOP_PROVIDER_PRESETS = [
  "google",
  "github",
  "microsoft",
  "auth0",
  "apple",
  "okta",
  "keycloak",
  "cognito",
  "gitlab",
  "discord",
  "slack",
  "line",
  "twitch",
  "linkedin",
  "amazon",
  "facebook",
  "twitter",
  "generic",
] as const;

export type TopProviderPreset = (typeof TOP_PROVIDER_PRESETS)[number];

export interface TopProviderPresetOptions {
  readonly tenant?: string;
  readonly domain?: string;
  readonly baseUrl?: string;
  readonly realm?: string;
  readonly region?: string;
  readonly providerName?: string;
  readonly discoveryUrl?: string;
  readonly defaultScope?: readonly string[];
}

export function listTopProviderPresets(): readonly TopProviderPreset[] {
  return TOP_PROVIDER_PRESETS;
}

function requireNonEmpty(value: string | undefined, message: string, details: Readonly<Record<string, string>>): string {
  if (!value || !value.trim()) {
    throw createAuthError("PUREQ_OIDC_INVALID_PROVIDER", message, { details });
  }
  return value.trim();
}

export function createTopProviderPreset(name: TopProviderPreset, options: TopProviderPresetOptions = {}): OIDCProviderDefinition {
  if (name === "google") {
    return oidcProviders.google();
  }

  if (name === "github") {
    return oidcProviders.github();
  }

  if (name === "microsoft") {
    const tenant = options.tenant ?? "common";
    if (!tenant.trim()) {
      throw createAuthError("PUREQ_OIDC_INVALID_PROVIDER", "pureq: microsoft preset requires a non-empty tenant", {
        details: { provider: "microsoft" },
      });
    }
    return oidcProviders.microsoft(tenant);
  }

  if (name === "apple") {
    return oidcProviders.apple();
  }

  if (name === "okta") {
    const domain = requireNonEmpty(options.domain, "pureq: okta preset requires domain", { provider: "okta" });
    return oidcProviders.okta(domain);
  }

  if (name === "keycloak") {
    const baseUrl = requireNonEmpty(options.baseUrl, "pureq: keycloak preset requires baseUrl", { provider: "keycloak" });
    const realm = requireNonEmpty(options.realm, "pureq: keycloak preset requires realm", { provider: "keycloak" });
    return oidcProviders.keycloak(baseUrl, realm);
  }

  if (name === "cognito") {
    const domain = requireNonEmpty(options.domain, "pureq: cognito preset requires domain", { provider: "cognito" });
    return oidcProviders.cognito(domain, options.region);
  }

  if (name === "gitlab") {
    return oidcProviders.gitlab(options.baseUrl);
  }

  if (name === "discord") {
    return oidcProviders.discord();
  }

  if (name === "slack") {
    return oidcProviders.slack();
  }

  if (name === "line") {
    return oidcProviders.line();
  }

  if (name === "twitch") {
    return oidcProviders.twitch();
  }

  if (name === "linkedin") {
    return oidcProviders.linkedin();
  }

  if (name === "amazon") {
    return oidcProviders.amazon();
  }

  if (name === "facebook") {
    return oidcProviders.facebook();
  }

  if (name === "twitter") {
    return oidcProviders.twitter();
  }

  if (name === "generic") {
    const providerName = requireNonEmpty(options.providerName, "pureq: generic preset requires providerName", {
      provider: "generic",
    });
    const discoveryUrl = requireNonEmpty(options.discoveryUrl, "pureq: generic preset requires discoveryUrl", {
      provider: "generic",
    });
    return oidcProviders.generic(providerName, discoveryUrl, options.defaultScope);
  }

  const domain = options.domain;
  if (!domain || !domain.trim()) {
    throw createAuthError("PUREQ_OIDC_INVALID_PROVIDER", "pureq: auth0 preset requires domain", {
      details: { provider: "auth0" },
    });
  }

  return oidcProviders.auth0(domain);
}
