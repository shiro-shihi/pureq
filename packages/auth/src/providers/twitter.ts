import { OAuthProvider } from "./oauth.js";
import type { AuthOAuthProviderOptions } from "../shared/index.js";

export interface TwitterProfile extends Record<string, any> {
  data: {
    id: string;
    name: string;
    username: string;
    profile_image_url?: string;
  };
}

export class TwitterProvider extends OAuthProvider<TwitterProfile> {
  constructor(options: AuthOAuthProviderOptions<TwitterProfile>) {
    super({
      ...options,
      id: options.id ?? "twitter",
      name: options.name ?? "Twitter",
      type: "oauth",
    });
  }
}
