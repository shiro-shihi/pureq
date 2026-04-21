import { OAuthProvider } from "./oauth.js";
import type { AuthOAuthProviderOptions } from "../shared/index.js";

export interface DiscordProfile extends Record<string, any> {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  bot?: boolean;
  system?: boolean;
  mfa_enabled?: boolean;
  locale?: string;
  verified?: boolean;
  email?: string | null;
  flags?: number;
  premium_type?: number;
  public_flags?: number;
}

export class DiscordProvider extends OAuthProvider<DiscordProfile> {
  constructor(options: AuthOAuthProviderOptions<DiscordProfile>) {
    super({
      ...options,
      id: options.id ?? "discord",
      name: options.name ?? "Discord",
      type: "oidc",
    });
  }
}
