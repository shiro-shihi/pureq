import { OAuthProvider } from "./oauth.js";
import type { AuthOAuthProviderOptions } from "../shared/index.js";

export interface GithubProfile extends Record<string, any> {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

export class GithubProvider extends OAuthProvider<GithubProfile> {
  constructor(options: AuthOAuthProviderOptions<GithubProfile>) {
    super({
      ...options,
      id: options.id ?? "github",
      name: options.name ?? "GitHub",
      type: "oauth",
    });
  }
}
