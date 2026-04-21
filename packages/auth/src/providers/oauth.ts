import type { AuthProvider, AuthOAuthProviderOptions } from "../shared/index.js";

/**
 * Base class for OAuth 2.0 and OIDC providers.
 */
export class OAuthProvider<TProfile = any, TMapped = any> implements AuthProvider {
  readonly id: string;
  readonly type: "oauth" | "oidc";
  readonly name: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly mapProfile?: (profile: TProfile) => TMapped | Promise<TMapped>;

  constructor(options: AuthOAuthProviderOptions<TProfile, TMapped> & { id: string; name: string; type?: "oauth" | "oidc" }) {
    this.id = options.id;
    this.name = options.name;
    this.type = options.type ?? "oauth";
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.mapProfile = options.mapProfile;
  }
}
