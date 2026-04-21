import { OAuthProvider } from "./oauth.js";
import type { AuthOAuthProviderOptions } from "../shared/index.js";

export interface GoogleProfile extends Record<string, any> {
  sub: string;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
  email: string;
  email_verified: boolean;
  locale: string;
}

export class GoogleProvider extends OAuthProvider<GoogleProfile> {
  constructor(options: AuthOAuthProviderOptions<GoogleProfile>) {
    super({
      ...options,
      id: options.id ?? "google",
      name: options.name ?? "Google",
      type: "oidc",
    });
  }
}
