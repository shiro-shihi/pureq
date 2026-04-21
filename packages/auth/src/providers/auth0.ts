import { OAuthProvider } from "./oauth.js";
import type { AuthOAuthProviderOptions } from "../shared/index.js";

export interface Auth0Profile extends Record<string, any> {
  sub: string;
  name: string;
  email: string;
  picture: string;
  nickname?: string;
  email_verified?: boolean;
}

export class Auth0Provider extends OAuthProvider<Auth0Profile> {
  constructor(options: AuthOAuthProviderOptions<Auth0Profile>) {
    super({
      ...options,
      id: options.id ?? "auth0",
      name: options.name ?? "Auth0",
      type: "oidc",
    });
  }
}
