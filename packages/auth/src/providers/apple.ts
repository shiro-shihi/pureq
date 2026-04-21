import { OAuthProvider } from "./oauth.js";
import type { AuthOAuthProviderOptions } from "../shared/index.js";

export interface AppleProfile extends Record<string, any> {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: {
    firstName?: string;
    lastName?: string;
  };
}

export class AppleProvider extends OAuthProvider<AppleProfile> {
  constructor(options: AuthOAuthProviderOptions<AppleProfile>) {
    super({
      ...options,
      id: options.id ?? "apple",
      name: options.name ?? "Apple",
      type: "oidc",
    });
  }
}
