import { OAuthProvider } from "./oauth.js";
import type { AuthOAuthProviderOptions } from "../shared/index.js";

export interface MicrosoftProfile extends Record<string, any> {
  sub: string;
  name: string;
  email?: string;
  preferred_username?: string;
  oid?: string;
  tid?: string;
}

export class MicrosoftProvider extends OAuthProvider<MicrosoftProfile> {
  constructor(options: AuthOAuthProviderOptions<MicrosoftProfile>) {
    super({
      ...options,
      id: options.id ?? "microsoft",
      name: options.name ?? "Microsoft",
      type: "oidc",
    });
  }
}
