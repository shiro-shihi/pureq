import { OAuthProvider } from "./oauth.js";
import type { AuthOAuthProviderOptions } from "../shared/index.js";

export interface LineProfile extends Record<string, any> {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  amr?: string[];
  name?: string;
  picture?: string;
  email?: string;
}

export class LineProvider extends OAuthProvider<LineProfile> {
  constructor(options: AuthOAuthProviderOptions<LineProfile>) {
    super({
      ...options,
      id: options.id ?? "line",
      name: options.name ?? "LINE",
      type: "oidc",
    });
  }
}
