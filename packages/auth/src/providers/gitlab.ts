import { OAuthProvider } from "./oauth.js";
import type { AuthOAuthProviderOptions } from "../shared/index.js";

export interface GitlabProfile extends Record<string, any> {
  sub: string;
  name?: string;
  nickname?: string;
  email?: string;
  picture?: string;
  groups?: string[];
}

export class GitlabProvider extends OAuthProvider<GitlabProfile> {
  constructor(options: AuthOAuthProviderOptions<GitlabProfile>) {
    super({
      ...options,
      id: options.id ?? "gitlab",
      name: options.name ?? "GitLab",
      type: "oidc",
    });
  }
}
