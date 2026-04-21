import { OAuthProvider } from "./oauth.js";
import type { AuthOAuthProviderOptions } from "../shared/index.js";

export interface LinkedinProfile extends Record<string, any> {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email?: string;
  email_verified?: boolean;
  locale?: {
    country?: string;
    language?: string;
  };
}

export class LinkedinProvider extends OAuthProvider<LinkedinProfile> {
  constructor(options: AuthOAuthProviderOptions<LinkedinProfile>) {
    super({
      ...options,
      id: options.id ?? "linkedin",
      name: options.name ?? "LinkedIn",
      type: "oidc",
    });
  }
}
