import { OAuthProvider } from "./oauth.js";
import type { AuthOAuthProviderOptions } from "../shared/index.js";

export interface SlackProfile extends Record<string, any> {
  ok: boolean;
  user: {
    name: string;
    id: string;
    email?: string;
    image_24?: string;
    image_32?: string;
    image_48?: string;
    image_72?: string;
    image_192?: string;
    image_512?: string;
    image_1024?: string;
  };
  team: {
    id: string;
    name?: string;
  };
}

export class SlackProvider extends OAuthProvider<SlackProfile> {
  constructor(options: AuthOAuthProviderOptions<SlackProfile>) {
    super({
      ...options,
      id: options.id ?? "slack",
      name: options.name ?? "Slack",
      type: "oidc",
    });
  }
}
