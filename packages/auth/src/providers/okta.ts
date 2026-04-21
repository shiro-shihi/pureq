import { OAuthProvider } from "./oauth.js";
import type { AuthOAuthProviderOptions } from "../shared/index.js";

export interface OktaProfile extends Record<string, any> {
  sub: string;
  name: string;
  email: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  zoneinfo?: string;
  locale?: string;
}

export class OktaProvider extends OAuthProvider<OktaProfile> {
  constructor(options: AuthOAuthProviderOptions<OktaProfile>) {
    super({
      ...options,
      id: options.id ?? "okta",
      name: options.name ?? "Okta",
      type: "oidc",
    });
  }
}
