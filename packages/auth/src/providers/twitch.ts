import { OAuthProvider } from "./oauth.js";
import type { AuthOAuthProviderOptions } from "../shared/index.js";

export interface TwitchProfile extends Record<string, any> {
  sub: string;
  preferred_username?: string;
  display_name?: string;
  picture?: string;
  updated_at?: string;
}

export class TwitchProvider extends OAuthProvider<TwitchProfile> {
  constructor(options: AuthOAuthProviderOptions<TwitchProfile>) {
    super({
      ...options,
      id: options.id ?? "twitch",
      name: options.name ?? "Twitch",
      type: "oidc",
    });
  }
}
