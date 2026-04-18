import { generateSecureId } from "@pureq/pureq";
import type {
  OIDCAuthorizationOptions,
  OIDCAuthorizationResult,
  OIDCCallbackParams,
  OIDCFlow,
  OIDCFlowOptions,
  OIDCProviderDefinition,
  OIDCTokenEndpointAuthMethod,
  TokenResponse,
} from "../shared/index.js";
import { base64UrlEncode, base64Encode, createAuthError } from "../shared/index.js";
import { decodeJwt } from "../jwt/index.js";
import { oidcProviders } from "./providers.js";

interface OIDCMetadata {
  readonly authorization_endpoint: string;
  readonly token_endpoint: string;
  readonly userinfo_endpoint?: string;
  readonly jwks_uri?: string;
  readonly end_session_endpoint?: string;
  readonly revocation_endpoint?: string;
  readonly introspection_endpoint?: string;
  readonly issuer?: string;
}

const MAX_CALLBACK_VALUE_LENGTH = 4096;
const REPLAY_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REPLAY_ENTRIES = 10_000;

function toTokenResponse(raw: Record<string, unknown>): TokenResponse {
  const accessToken = raw.access_token ?? raw.accessToken;
  if (typeof accessToken !== "string" || !accessToken.trim()) {
    throw createAuthError("PUREQ_OIDC_INVALID_TOKEN_RESPONSE", "pureq: OIDC token response is missing access_token", {
      details: { keys: Object.keys(raw).sort().join(",") },
    });
  }

  return {
    accessToken,
    ...(typeof raw.id_token === "string" ? { idToken: raw.id_token } : {}),
    ...(typeof raw.refresh_token === "string" ? { refreshToken: raw.refresh_token } : {}),
    ...(typeof raw.token_type === "string" ? { tokenType: raw.token_type } : {}),
    ...(typeof raw.expires_in === "number" ? { expiresIn: raw.expires_in } : {}),
    ...(typeof raw.scope === "string" ? { scope: raw.scope } : {}),
    raw,
  };
}

async function fetchMetadata(discoveryUrl: string): Promise<OIDCMetadata> {
  const response = await fetch(discoveryUrl);
  if (!response.ok) {
    throw createAuthError("PUREQ_OIDC_DISCOVERY_FAILED", `pureq: failed to load OIDC metadata (${response.status})`, {
      details: { status: response.status, discoveryUrl },
    });
  }

  const json = (await response.json()) as Partial<OIDCMetadata>;
  if (!json.authorization_endpoint || !json.token_endpoint) {
    throw createAuthError("PUREQ_OIDC_INVALID_DISCOVERY_DOCUMENT", "pureq: invalid OIDC discovery document", {
      details: { discoveryUrl },
    });
  }

  return {
    authorization_endpoint: json.authorization_endpoint,
    token_endpoint: json.token_endpoint,
    ...(json.userinfo_endpoint !== undefined ? { userinfo_endpoint: json.userinfo_endpoint } : {}),
    ...(json.jwks_uri !== undefined ? { jwks_uri: json.jwks_uri } : {}),
    ...(json.end_session_endpoint !== undefined ? { end_session_endpoint: json.end_session_endpoint } : {}),
    ...(json.revocation_endpoint !== undefined ? { revocation_endpoint: json.revocation_endpoint } : {}),
    ...(json.introspection_endpoint !== undefined ? { introspection_endpoint: json.introspection_endpoint } : {}),
    ...(json.issuer !== undefined ? { issuer: json.issuer } : {}),
  };
}

async function createCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

function toSearchParams(callback: string | URL | URLSearchParams): URLSearchParams {
  if (callback instanceof URLSearchParams) {
    return callback;
  }

  if (callback instanceof URL) {
    return callback.searchParams;
  }

  if (callback.startsWith("http://") || callback.startsWith("https://")) {
    return new URL(callback).searchParams;
  }

  if (callback.startsWith("?")) {
    return new URLSearchParams(callback.slice(1));
  }

  return new URLSearchParams(callback);
}

function sweepReplayCache(cache: Map<string, number>, now: number): void {
  if (cache.size <= MAX_REPLAY_ENTRIES) {
    return;
  }
  for (const [key, ts] of cache) {
    if (now - ts > REPLAY_TTL_MS || cache.size > MAX_REPLAY_ENTRIES) {
      cache.delete(key);
    }
  }
}

/** Validate id_token claims (iss, aud, exp, nonce). */
function validateIdTokenClaims(
  idToken: string,
  expectedIssuer: string | undefined,
  expectedAudience: string,
  expectedNonce: string | undefined
): void {
  let claims: { readonly iss?: string; readonly aud?: string | readonly string[]; readonly exp?: number; readonly nonce?: string };
  try {
    claims = decodeJwt(idToken);
  } catch {
    throw createAuthError("PUREQ_OIDC_INVALID_ID_TOKEN", "pureq: failed to decode id_token");
  }

  if (expectedIssuer && claims.iss !== expectedIssuer) {
    throw createAuthError("PUREQ_OIDC_ID_TOKEN_ISSUER_MISMATCH", "pureq: id_token issuer mismatch", {
      details: { expected: expectedIssuer, actual: claims.iss ?? "undefined" },
    });
  }

  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(expectedAudience)) {
    throw createAuthError("PUREQ_OIDC_ID_TOKEN_AUDIENCE_MISMATCH", "pureq: id_token audience mismatch", {
      details: { expected: expectedAudience },
    });
  }

  if (typeof claims.exp === "number" && claims.exp * 1000 < Date.now()) {
    throw createAuthError("PUREQ_OIDC_ID_TOKEN_EXPIRED", "pureq: id_token has expired");
  }

  if (expectedNonce && claims.nonce !== expectedNonce) {
    throw createAuthError("PUREQ_OIDC_ID_TOKEN_NONCE_MISMATCH", "pureq: id_token nonce mismatch");
  }
}

function buildAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${base64Encode(`${clientId}:${clientSecret}`)}`;
}

export function parseOIDCCallbackParams(
  callback: string | URL | URLSearchParams,
  expectedState?: string
): OIDCCallbackParams {
  const params = toSearchParams(callback);

  const readSingle = (name: string): string | null => {
    const values = params.getAll(name).filter((value) => value.length > 0);
    if (values.length > 1) {
      throw createAuthError("PUREQ_OIDC_INVALID_CALLBACK", `pureq: OIDC callback has duplicated ${name} parameter`, {
        details: { parameter: name },
      });
    }
    const value = values[0] ?? null;
    if (value !== null && value.length > MAX_CALLBACK_VALUE_LENGTH) {
      throw createAuthError("PUREQ_OIDC_INVALID_CALLBACK", `pureq: OIDC callback ${name} is too large`, {
        details: { parameter: name, length: value.length },
      });
    }
    return value;
  };

  const error = readSingle("error");
  if (error) {
    const description = readSingle("error_description");
    throw createAuthError("PUREQ_OIDC_CALLBACK_ERROR", description ? `pureq: OIDC callback error (${error}): ${description}` : `pureq: OIDC callback error (${error})`, {
      details: {
        error,
        ...(description ? { description } : {}),
      },
    });
  }

  const code = readSingle("code");
  if (!code) {
    throw createAuthError("PUREQ_OIDC_MISSING_CODE", "pureq: OIDC callback is missing authorization code", {
      details: { callback: String(callback) },
    });
  }

  const state = readSingle("state") ?? undefined;
  if (expectedState && state !== expectedState) {
    throw createAuthError("PUREQ_OIDC_STATE_MISMATCH", "pureq: OIDC state mismatch", {
      details: {
        expectedState,
        ...(state !== undefined ? { state } : {}),
      },
    });
  }

  return {
    code,
    ...(state ? { state } : {}),
  };
}

/**
 * Create an OIDC authorization code flow.
 *
 * SEC-C5: getAuthorizationUrl returns { url, state, codeVerifier, nonce }.
 * SEC-H1: No singleton codeVerifier — returned to caller for explicit management.
 * SEC-H5: id_token validation (iss, aud, exp, nonce).
 * SEC-H6: nonce support.
 * SEC-M5: tokenEndpointAuthMethod support.
 * FEAT-M4: Full OIDC metadata extraction.
 * FEAT-M5: getLogoutUrl.
 * FEAT-L4: introspect.
 */
export function createOIDCFlow(options: OIDCFlowOptions): OIDCFlow {
  if (!options.clientId.trim()) {
    throw createAuthError("PUREQ_OIDC_INVALID_CONFIGURATION", "pureq: OIDC clientId is required", {
      details: { field: "clientId" },
    });
  }
  if (!options.discoveryUrl.trim()) {
    throw createAuthError("PUREQ_OIDC_INVALID_CONFIGURATION", "pureq: OIDC discoveryUrl is required", {
      details: { field: "discoveryUrl" },
    });
  }
  if (!options.redirectUri.trim()) {
    throw createAuthError("PUREQ_OIDC_INVALID_CONFIGURATION", "pureq: OIDC redirectUri is required", {
      details: { field: "redirectUri" },
    });
  }

  let metadataPromise: Promise<OIDCMetadata> | null = null;
  // SEC-H2: TTL-based replay detection
  const consumedCallbackCodes = new Map<string, number>();
  const authMethod: OIDCTokenEndpointAuthMethod = options.tokenEndpointAuthMethod ?? "client_secret_post";

  const getMetadata = (): Promise<OIDCMetadata> => {
    if (!metadataPromise) {
      metadataPromise = fetchMetadata(options.discoveryUrl);
    }

    return metadataPromise;
  };

  const buildTokenHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
    if (authMethod === "client_secret_basic" && options.clientSecret) {
      headers["Authorization"] = buildAuthHeader(options.clientId, options.clientSecret);
    }
    return headers;
  };

  const appendClientCredentials = (body: URLSearchParams): void => {
    body.set("client_id", options.clientId);
    if (authMethod === "client_secret_post" && options.clientSecret) {
      body.set("client_secret", options.clientSecret);
    }
  };

  return {
    async getAuthorizationUrl(authorizationOptions: OIDCAuthorizationOptions = {}): Promise<OIDCAuthorizationResult> {
      const metadata = await getMetadata();
      const url = new URL(metadata.authorization_endpoint);
      const state = authorizationOptions.state ?? generateSecureId("oidc-state");
      const nonce = authorizationOptions.nonce ?? generateSecureId("oidc-nonce");
      const scope = authorizationOptions.scope ?? options.defaultScope ?? ["openid"];
      const codeVerifier = generateSecureId("pkce");
      const codeChallengeMethod = authorizationOptions.codeChallengeMethod ?? "S256";
      const codeChallenge =
        authorizationOptions.codeChallenge ??
        (codeChallengeMethod === "plain" ? codeVerifier : await createCodeChallenge(codeVerifier));

      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", options.clientId);
      url.searchParams.set("redirect_uri", options.redirectUri);
      url.searchParams.set("scope", scope.join(" "));
      url.searchParams.set("state", state);
      url.searchParams.set("nonce", nonce);
      url.searchParams.set("code_challenge", codeChallenge);
      url.searchParams.set("code_challenge_method", codeChallengeMethod);

      if (authorizationOptions.prompt) {
        url.searchParams.set("prompt", authorizationOptions.prompt);
      }

      for (const [key, value] of Object.entries(authorizationOptions.extraParams ?? {})) {
        url.searchParams.set(key, value);
      }

      return { url: url.toString(), state, codeVerifier, nonce };
    },

    async exchangeCode(code: string, requestOptions: { readonly codeVerifier: string }): Promise<TokenResponse> {
      const metadata = await getMetadata();
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: options.redirectUri,
        code_verifier: requestOptions.codeVerifier,
      });
      appendClientCredentials(body);

      const response = await fetch(metadata.token_endpoint, {
        method: "POST",
        headers: buildTokenHeaders(),
        body: body.toString(),
      });

      if (!response.ok) {
        throw createAuthError("PUREQ_OIDC_TOKEN_EXCHANGE_FAILED", `pureq: OIDC code exchange failed (${response.status})`, {
          details: { status: response.status, tokenEndpoint: metadata.token_endpoint },
        });
      }

      const tokenResponse = toTokenResponse((await response.json()) as Record<string, unknown>);

      // SEC-H5: validate id_token if present
      if (tokenResponse.idToken) {
        validateIdTokenClaims(tokenResponse.idToken, metadata.issuer, options.clientId, undefined);
      }

      return tokenResponse;
    },

    async exchangeCallback(
      callback: string | URL | URLSearchParams,
      requestOptions: { readonly expectedState?: string; readonly codeVerifier: string; readonly expectedNonce?: string }
    ): Promise<TokenResponse> {
      const params = parseOIDCCallbackParams(callback, requestOptions.expectedState);

      // SEC-H2: TTL-based replay detection
      const now = Date.now();
      sweepReplayCache(consumedCallbackCodes, now);

      const existingTs = consumedCallbackCodes.get(params.code);
      if (existingTs !== undefined && now - existingTs < REPLAY_TTL_MS) {
        throw createAuthError("PUREQ_OIDC_CALLBACK_REPLAY", "pureq: OIDC callback code replay detected", {
          details: { code: params.code },
        });
      }
      consumedCallbackCodes.set(params.code, now);

      const tokenResponse = await this.exchangeCode(params.code, {
        codeVerifier: requestOptions.codeVerifier,
      });

      // SEC-H5 + SEC-H6: validate id_token nonce
      if (tokenResponse.idToken && requestOptions.expectedNonce) {
        const metadata = await getMetadata();
        validateIdTokenClaims(tokenResponse.idToken, metadata.issuer, options.clientId, requestOptions.expectedNonce);
      }

      return tokenResponse;
    },

    async refresh(refreshToken: string): Promise<TokenResponse> {
      const metadata = await getMetadata();
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      });
      appendClientCredentials(body);

      const response = await fetch(metadata.token_endpoint, {
        method: "POST",
        headers: buildTokenHeaders(),
        body: body.toString(),
      });

      if (!response.ok) {
        throw createAuthError("PUREQ_OIDC_TOKEN_REFRESH_FAILED", `pureq: OIDC token refresh failed (${response.status})`, {
          details: { status: response.status, tokenEndpoint: metadata.token_endpoint },
        });
      }

      return toTokenResponse((await response.json()) as Record<string, unknown>);
    },

    /** Fetch user profile from the OIDC userinfo endpoint (FEAT-M4). */
    async getUserInfo(accessToken: string): Promise<Readonly<Record<string, unknown>>> {
      const metadata = await getMetadata();
      if (!metadata.userinfo_endpoint) {
        throw createAuthError("PUREQ_OIDC_NO_USERINFO_ENDPOINT", "pureq: OIDC provider does not expose a userinfo endpoint");
      }

      const response = await fetch(metadata.userinfo_endpoint, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw createAuthError("PUREQ_OIDC_USERINFO_FAILED", `pureq: OIDC userinfo request failed (${response.status})`);
      }

      return (await response.json()) as Record<string, unknown>;
    },

    /** Build a logout URL for RP-initiated logout (FEAT-M5). */
    async getLogoutUrl(logoutOptions?: { readonly idTokenHint?: string; readonly postLogoutRedirectUri?: string }): Promise<string> {
      const metadata = await getMetadata();
      if (!metadata.end_session_endpoint) {
        throw createAuthError("PUREQ_OIDC_NO_END_SESSION_ENDPOINT", "pureq: OIDC provider does not expose an end_session_endpoint");
      }

      const url = new URL(metadata.end_session_endpoint);
      if (logoutOptions?.idTokenHint) {
        url.searchParams.set("id_token_hint", logoutOptions.idTokenHint);
      }
      if (logoutOptions?.postLogoutRedirectUri) {
        url.searchParams.set("post_logout_redirect_uri", logoutOptions.postLogoutRedirectUri);
      }
      url.searchParams.set("client_id", options.clientId);
      return url.toString();
    },

    /** Introspect a token via RFC 7662 (FEAT-L4). */
    async introspect(token: string): Promise<Readonly<Record<string, unknown>>> {
      const metadata = await getMetadata();
      if (!metadata.introspection_endpoint) {
        throw createAuthError("PUREQ_OIDC_NO_INTROSPECTION_ENDPOINT", "pureq: OIDC provider does not expose an introspection endpoint");
      }

      const body = new URLSearchParams({ token });
      appendClientCredentials(body);

      const response = await fetch(metadata.introspection_endpoint, {
        method: "POST",
        headers: buildTokenHeaders(),
        body: body.toString(),
      });

      if (!response.ok) {
        throw createAuthError("PUREQ_OIDC_INTROSPECTION_FAILED", `pureq: OIDC token introspection failed (${response.status})`);
      }

      return (await response.json()) as Record<string, unknown>;
    },
  };
}

/** @deprecated Use `createOIDCFlow` (capital F) instead. */
export const createOIDCflow = createOIDCFlow;

export function createOIDCFlowFromProvider(
  provider: OIDCProviderDefinition,
  options: Omit<OIDCFlowOptions, "discoveryUrl" | "defaultScope"> & { readonly defaultScope?: readonly string[] }
): OIDCFlow {
  if (!provider.name.trim()) {
    throw createAuthError("PUREQ_OIDC_INVALID_PROVIDER", "pureq: OIDC provider name is required", {
      details: { field: "name" },
    });
  }
  if (!provider.discoveryUrl.trim()) {
    throw createAuthError("PUREQ_OIDC_INVALID_PROVIDER", "pureq: OIDC provider discoveryUrl is required", {
      details: { field: "discoveryUrl", provider: provider.name },
    });
  }

  const flow = createOIDCFlow({
    ...options,
    discoveryUrl: provider.discoveryUrl,
    ...(options.defaultScope !== undefined || provider.defaultScope !== undefined
      ? { defaultScope: options.defaultScope ?? provider.defaultScope }
      : {}),
  });

  return {
    async getAuthorizationUrl(authorizationOptions: OIDCAuthorizationOptions = {}) {
      provider.validateAuthorizationOptions?.(authorizationOptions);
      return flow.getAuthorizationUrl({
        ...authorizationOptions,
        extraParams: {
          ...(provider.authorizationDefaults ?? {}),
          ...(authorizationOptions.extraParams ?? {}),
        },
      });
    },
    exchangeCode: flow.exchangeCode.bind(flow),
    exchangeCallback: flow.exchangeCallback.bind(flow),
    refresh: flow.refresh.bind(flow),
    ...(flow.getUserInfo ? { getUserInfo: flow.getUserInfo.bind(flow) } : {}),
    ...(flow.getLogoutUrl ? { getLogoutUrl: flow.getLogoutUrl.bind(flow) } : {}),
    ...(flow.introspect ? { introspect: flow.introspect.bind(flow) } : {}),
  };
}

/** @deprecated Use `createOIDCFlowFromProvider` (capital F) instead. */
export const createOIDCflowFromProvider = createOIDCFlowFromProvider;

export { oidcProviders };