import { OAuthProvider } from "./oauth.js";
import type { AuthOAuthProviderOptions } from "../shared/index.js";

export interface AmazonProfile extends Record<string, any> {
  sub: string;
  name?: string;
  email?: string;
  postal_code?: string;
}

export class AmazonProvider extends OAuthProvider<AmazonProfile> {
  constructor(options: AuthOAuthProviderOptions<AmazonProfile>) {
    super({
      ...options,
      id: options.id ?? "amazon",
      name: options.name ?? "Amazon",
      type: "oidc",
    });
  }
}
