import type {
  AuthAccount,
  AuthBridgeRequestLike,
  AuthConfig,
  AuthInstance,
  AuthPersistedSession,
  AuthProvider,
  AuthRouteHandlers,
  AuthSessionState,
  AuthUser,
} from "../shared/index.js";
import { generateSecureId } from "@pureq/pureq";
import { createAuthPreset } from "../presets/index.js";
import { createAuthBridge } from "../bridge/index.js";
import { createAuthDebugLogger } from "../debug/index.js";
import { createAuthError } from "../shared/index.js";

const SESSION_TOKEN_PREFIX = "session:";
const REFRESH_TOKEN_PREFIX = "refresh:";
const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type RouteRequest = AuthBridgeRequestLike & { readonly method?: string; readonly url?: string; readonly body?: unknown };

function toJsonResponse(body: unknown, status: number, headers?: Headers): Response {
  const responseHeaders = headers ?? new Headers();
  if (!responseHeaders.has("content-type")) {
    responseHeaders.set("content-type", "application/json");
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

function appendSetCookieHeaders(headers: Headers, values: readonly string[]): void {
  for (const value of values) {
    headers.append("Set-Cookie", value);
  }
}

function readMethod(request: RouteRequest): string {
  return (request.method ?? "GET").toUpperCase();
}

function parseUrlSearchParams(url?: string): URLSearchParams {
  if (!url) {
    return new URLSearchParams();
  }
  try {
    return new URL(url, "https://pureq.local").searchParams;
  } catch {
    return new URLSearchParams();
  }
}

function readBodyRecord(body: unknown): Readonly<Record<string, unknown>> {
  if (body && typeof body === "object") {
    return body as Readonly<Record<string, unknown>>;
  }
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === "object") {
        return parsed as Readonly<Record<string, unknown>>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function readString(record: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = record[key];
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function toProviderType(value: string | null): AuthAccount["type"] {
  if (value === "oauth" || value === "oidc" || value === "credentials" || value === "email") {
    return value;
  }
  return "oidc";
}

function toSessionToken(accessToken: string | null): string | null {
  if (!accessToken || !accessToken.startsWith(SESSION_TOKEN_PREFIX)) {
    return null;
  }
  const token = accessToken.slice(SESSION_TOKEN_PREFIX.length);
  return token || null;
}

function toStatusFromErrorCode(code: string): number {
  if (code === "PUREQ_AUTH_UNAUTHORIZED") {
    return 401;
  }
  if (
    code === "PUREQ_AUTH_INVALID_PROVIDER" ||
    code === "PUREQ_AUTH_INVALID_CREDENTIALS" ||
    code === "PUREQ_AUTH_MISSING_TOKEN"
  ) {
    return 400;
  }
  return 500;
}

function toErrorResponse(error: unknown, fallbackCode: string, fallbackMessage: string): Response {
  const code =
    error && typeof error === "object" && "code" in error && typeof (error as { code: unknown }).code === "string"
      ? (error as { code: string }).code
      : fallbackCode;
  const message =
    error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string"
      ? (error as { message: string }).message
      : fallbackMessage;

  return toJsonResponse(
    {
      error: {
        code,
        message,
      },
    },
    toStatusFromErrorCode(code)
  );
}

async function resolveAdapterUser(config: AuthConfig, user: AuthUser): Promise<AuthUser> {
  const adapter = config.adapter;
  if (!adapter) {
    return user;
  }

  const byId = await adapter.getUser(user.id);
  if (byId) {
    return byId;
  }

  if (user.email) {
    const byEmail = await adapter.getUserByEmail(user.email);
    if (byEmail) {
      return byEmail;
    }
  }

  const created = await adapter.createUser({
    ...(user.email !== undefined ? { email: user.email } : {}),
    ...(user.emailVerified !== undefined ? { emailVerified: user.emailVerified } : {}),
    ...(user.name !== undefined ? { name: user.name } : {}),
    ...(user.image !== undefined ? { image: user.image } : {}),
  });

  await config.callbacks?.createUser?.({ user: created });
  return created;
}

async function issueSession(
  config: AuthConfig,
  instance: Pick<AuthInstance, "session">,
  userId: string
): Promise<{ readonly state: AuthSessionState; readonly persisted: AuthPersistedSession }> {
  const sessionToken = generateSecureId();
  const accessToken = `${SESSION_TOKEN_PREFIX}${sessionToken}`;
  const refreshToken = `${REFRESH_TOKEN_PREFIX}${generateSecureId()}`;
  const expiresAt = new Date(Date.now() + DEFAULT_SESSION_TTL_MS);
  const persisted: AuthPersistedSession = {
    sessionToken,
    userId,
    expiresAt,
  };

  if (config.adapter) {
    await config.adapter.createSession(persisted);
  }

  await instance.session.setTokens({ accessToken, refreshToken });
  const state = await instance.session.getState();
  return { state, persisted };
}

async function ensureLinkedAccount(
  config: AuthConfig,
  user: AuthUser,
  account: AuthAccount
): Promise<void> {
  const adapter = config.adapter;
  if (!adapter) {
    return;
  }

  const existing = await adapter.getUserByAccount(account.provider, account.providerAccountId);
  if (!existing) {
    await adapter.linkAccount(account);
    await config.callbacks?.linkAccount?.({ user, account });
  }
}

function findProvider(config: AuthConfig, providerId: string | null): AuthProvider | null {
  if (!providerId) {
    return null;
  }
  return (config.providers ?? []).find((provider) => provider.id === providerId) ?? null;
}

/**
 * FEAT-H4: Route handlers for sign-in, callback, sign-out, and session.
 * Provides a minimal but complete auth route handler surface.
 */
function createRouteHandlers(config: AuthConfig, instance: Pick<AuthInstance, "session" | "bridge" | "debug">): AuthRouteHandlers {
  const bridge = instance.bridge;
  const session = instance.session;

  return {
    async handleSignIn(request) {
      instance.debug.log("routes", "sign-in request received");

      const method = readMethod(request);

      if (method === "GET") {
        const providers = config.providers ?? [];
        const providerList = providers.map((p) => ({ id: p.id, name: p.name, type: p.type }));

        return toJsonResponse({ providers: providerList }, 200);
      }

      const body = readBodyRecord(request.body);
      const provider = findProvider(config, readString(body, "provider"));
      if (!provider) {
        return toJsonResponse(
          {
            error: {
              code: "PUREQ_AUTH_INVALID_PROVIDER",
              message: "provider is required",
            },
          },
          400
        );
      }

      if (provider.type === "email") {
        const email = readString(body, "email");
        if (!email) {
          return toJsonResponse(
            {
              error: {
                code: "PUREQ_AUTH_INVALID_CREDENTIALS",
                message: "email is required",
              },
            },
            400
          );
        }

        if (!config.adapter?.createVerificationToken || !config.adapter?.useVerificationToken) {
          return toJsonResponse(
            {
              error: {
                code: "PUREQ_AUTH_INVALID_PROVIDER",
                message: "email provider requires adapter verification token support",
              },
            },
            400
          );
        }

        const token = generateSecureId();
        const callbackUrl = readString(body, "callbackUrl") ?? "https://pureq.local/auth/callback";
        const verificationUrl = `${callbackUrl}${callbackUrl.includes("?") ? "&" : "?"}provider=${encodeURIComponent(
          provider.id
        )}&token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

        if ("sendVerificationRequest" in provider && typeof provider.sendVerificationRequest === "function") {
          await provider.sendVerificationRequest({
            identifier: email,
            token,
            url: verificationUrl,
          });
        }

        await config.adapter.createVerificationToken({
          identifier: email,
          token,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        });

        return toJsonResponse({ ok: true, provider: provider.id, email }, 200);
      }

      if (provider.type !== "credentials" || !("authorize" in provider) || typeof provider.authorize !== "function") {
        return toJsonResponse(
          {
            error: {
              code: "PUREQ_AUTH_INVALID_PROVIDER",
              message: "unsupported sign-in provider type",
            },
          },
          400
        );
      }

      const credentialsRaw = body.credentials;
      const credentials =
        credentialsRaw && typeof credentialsRaw === "object"
          ? Object.fromEntries(
              Object.entries(credentialsRaw as Readonly<Record<string, unknown>>).filter(
                (entry): entry is [string, string] => typeof entry[1] === "string"
              )
            )
          : {};

      const maybeUser = await provider.authorize(credentials);
      if (!maybeUser) {
        return toJsonResponse(
          {
            error: {
              code: "PUREQ_AUTH_INVALID_CREDENTIALS",
              message: "invalid credentials",
            },
          },
          401
        );
      }

      const user = await resolveAdapterUser(config, maybeUser);
      const account: AuthAccount = {
        userId: user.id,
        type: "credentials",
        provider: provider.id,
        providerAccountId: user.id,
      };

      const allow = await config.callbacks?.signIn?.({ user, account });
      if (allow === false) {
        return toJsonResponse(
          {
            error: {
              code: "PUREQ_AUTH_UNAUTHORIZED",
              message: "sign-in denied by callback",
            },
          },
          401
        );
      }

      await ensureLinkedAccount(config, user, account);
      const { state, persisted } = await issueSession(config, instance, user.id);
      const projectedSession = await config.callbacks?.session?.({
        session: persisted,
        user,
        token: {
          accessToken: state.accessToken,
          refreshToken: state.refreshToken,
        },
      });

      const responseHeaders = new Headers();
      appendSetCookieHeaders(responseHeaders, bridge.buildSetCookieHeaders(state));

      return toJsonResponse(
        {
          ok: true,
          provider: provider.id,
          user,
          session: projectedSession ?? persisted,
          state,
        },
        200,
        responseHeaders
      );
    },

    async handleCallback(request) {
      instance.debug.log("routes", "callback received");
      try {
        const query = parseUrlSearchParams(request.url);
        const providerId = query.get("provider");
        const providerAccountId = query.get("providerAccountId");

        if (providerId === "email") {
          if (!config.adapter?.useVerificationToken) {
            return toJsonResponse(
              {
                error: {
                  code: "PUREQ_AUTH_INVALID_PROVIDER",
                  message: "email callback requires adapter verification token support",
                },
              },
              400
            );
          }

          const email = query.get("email");
          const token = query.get("token");
          if (!email || !token) {
            return toJsonResponse(
              {
                error: {
                  code: "PUREQ_AUTH_MISSING_TOKEN",
                  message: "email callback requires token and email",
                },
              },
              400
            );
          }

          const verification = await config.adapter.useVerificationToken({ identifier: email, token });
          if (!verification) {
            return toJsonResponse(
              {
                error: {
                  code: "PUREQ_AUTH_UNAUTHORIZED",
                  message: "invalid or expired email verification token",
                },
              },
              401
            );
          }

          let user = await config.adapter.getUserByEmail(email);
          if (!user) {
            user = await config.adapter.createUser({ email });
            await config.callbacks?.createUser?.({ user });
          }

          const account: AuthAccount = {
            userId: user.id,
            type: "email",
            provider: "email",
            providerAccountId: email,
          };

          const allow = await config.callbacks?.signIn?.({ user, account });
          if (allow === false) {
            return toJsonResponse(
              {
                error: {
                  code: "PUREQ_AUTH_UNAUTHORIZED",
                  message: "sign-in denied by callback",
                },
              },
              401
            );
          }

          await ensureLinkedAccount(config, user, account);
          const { state } = await issueSession(config, instance, user.id);
          const responseHeaders = new Headers();
          appendSetCookieHeaders(responseHeaders, bridge.buildSetCookieHeaders(state));

          return toJsonResponse({ ok: true, state, user, provider: "email" }, 200, responseHeaders);
        }

        if (!config.adapter || !providerId || !providerAccountId) {
          const state = bridge.readSession(request);
          const responseHeaders = new Headers();
          appendSetCookieHeaders(responseHeaders, bridge.buildSetCookieHeaders(state));
          return toJsonResponse({ ok: true, state }, 200, responseHeaders);
        }

        const adapter = config.adapter;
        const linked = await adapter.getUserByAccount(providerId, providerAccountId);
        const explicitUserId = query.get("userId");
        const email = query.get("email");

        let user = linked;
        if (!user && explicitUserId) {
          user = await adapter.getUser(explicitUserId);
        }

        if (!user && email) {
          const byEmail = await adapter.getUserByEmail(email);
          if (byEmail && !config.allowDangerousAccountLinking) {
            throw createAuthError(
              "PUREQ_AUTH_UNAUTHORIZED",
              "account linking requires explicit approval",
              { details: { provider: providerId } }
            );
          }
          user = byEmail;
        }

        if (!user && email) {
          user = await adapter.createUser({ email });
          await config.callbacks?.createUser?.({ user });
        }

        if (!user) {
          return toJsonResponse(
            {
              error: {
                code: "PUREQ_AUTH_MISSING_TOKEN",
                message: "callback user context is required",
              },
            },
            400
          );
        }

        const account: AuthAccount = {
          userId: user.id,
          type: toProviderType(query.get("type")),
          provider: providerId,
          providerAccountId,
          ...(query.get("accessToken") ? { accessToken: query.get("accessToken") } : {}),
          ...(query.get("refreshToken") ? { refreshToken: query.get("refreshToken") } : {}),
          ...(query.get("tokenType") ? { tokenType: query.get("tokenType") } : {}),
          ...(query.get("scope") ? { scope: query.get("scope") } : {}),
          ...(query.get("idToken") ? { idToken: query.get("idToken") } : {}),
        };

        const allow = await config.callbacks?.signIn?.({ user, account });
        if (allow === false) {
          return toJsonResponse(
            {
              error: {
                code: "PUREQ_AUTH_UNAUTHORIZED",
                message: "sign-in denied by callback",
              },
            },
            401
          );
        }

        await ensureLinkedAccount(config, user, account);
        const { state } = await issueSession(config, instance, user.id);
        const responseHeaders = new Headers();
        appendSetCookieHeaders(responseHeaders, bridge.buildSetCookieHeaders(state));

        return toJsonResponse({ ok: true, state, user, linked: Boolean(linked) }, 200, responseHeaders);
      } catch (error) {
        instance.debug.log("routes", "callback failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        return toErrorResponse(error, "PUREQ_AUTH_UNKNOWN", "callback failed");
      }
    },

    async handleSignOut(request) {
      instance.debug.log("routes", "sign-out request");

      const snapshot = bridge.readSession(request);
      const sessionToken = toSessionToken(snapshot.accessToken);
      if (sessionToken && config.adapter) {
        const existing = await config.adapter.getSessionAndUser(sessionToken);
        if (existing) {
          await config.callbacks?.signOut?.({
            session: existing.session,
            token: {
              accessToken: snapshot.accessToken,
              refreshToken: snapshot.refreshToken,
            },
          });
        }
        await config.adapter.deleteSession(sessionToken);
      }

      await session.logout();

      const emptyState: AuthSessionState = { accessToken: null, refreshToken: null };
      const headers = bridge.buildSetCookieHeaders(emptyState);
      const responseHeaders = new Headers();
      appendSetCookieHeaders(responseHeaders, headers);

      return toJsonResponse({ ok: true }, 200, responseHeaders);
    },

    async handleSession(request) {
      instance.debug.log("routes", "session request");

      const state = bridge.readSession(request);
      const sessionToken = toSessionToken(state.accessToken);

      if (sessionToken && config.adapter) {
        const existing = await config.adapter.getSessionAndUser(sessionToken);
        if (existing) {
          const projectedSession = await config.callbacks?.session?.({
            session: existing.session,
            user: existing.user,
            token: {
              accessToken: state.accessToken,
              refreshToken: state.refreshToken,
            },
          });

          return toJsonResponse({
            ...state,
            user: existing.user,
            ...(projectedSession ? { session: projectedSession } : {}),
          }, 200);
        }
      }

      return toJsonResponse(state, 200);
    },
  };
}

/**
 * DX-H2: Unified auth configuration entry point.
 * Composes storage, session manager, bridge, route handlers, and debug logger from a single config object.
 */
export function createAuth(config: AuthConfig = {}): AuthInstance {
  const debug = createAuthDebugLogger(config.debug ?? false);
  debug.log("core", "initializing auth instance");

  const preset = createAuthPreset({
    ...(config.storage !== undefined ? { storage: config.storage } : {}),
    ...(config.session !== undefined ? { session: config.session } : {}),
    ...(config.bridge !== undefined ? { bridge: config.bridge } : {}),
  });

  const bridge = createAuthBridge(config.bridge);

  const instance: AuthInstance = {
    storage: preset.storage,
    session: preset.session,
    bridge,
    debug,
    handlers: undefined as unknown as AuthRouteHandlers,
  };

  // Create handlers with access to the instance
  const handlers = createRouteHandlers(config, instance);
  (instance as { handlers: AuthRouteHandlers }).handlers = handlers;

  debug.log("core", "auth instance initialized");

  return instance;
}

export type { AuthConfig, AuthInstance, AuthRouteHandlers } from "../shared/index.js";
export { createAuthKit } from "./kit.js";
export type { AuthKit, AuthKitConfig } from "./kit.js";
export { createAuthStarter } from "./starter.js";
export type { AuthStarter, AuthStarterConfig } from "./starter.js";
