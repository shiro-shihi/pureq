import { OAuthProvider } from "./oauth.js";
import type { AuthOAuthProviderOptions } from "../shared/index.js";

export interface FacebookProfile extends Record<string, any> {
  id: string;
  name: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  picture?: {
    data: {
      url: string;
    };
  };
}

export class FacebookProvider extends OAuthProvider<FacebookProfile> {
  constructor(options: AuthOAuthProviderOptions<FacebookProfile>) {
    super({
      ...options,
      id: options.id ?? "facebook",
      name: options.name ?? "Facebook",
      type: "oauth",
    });
  }
}
