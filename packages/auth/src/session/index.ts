import type {
  AuthSessionEvent,
  AuthSessionEventListener,
  AuthSessionManager,
  AuthSessionManagerOptions,
  AuthSessionState,
  AuthStore,
  AuthTokenRotationPolicy,
  AuthTokens,
} from "../shared/index.js";
import { decodeJwt } from "../jwt/index.js";
import { generateSecureId } from "@pureq/pureq";

type SessionBroadcastMessage =
  | {
      readonly kind: "rotate";
      readonly tokens: AuthTokens;
      readonly policy: AuthTokenRotationPolicy;
      readonly from: string;
      readonly sig: string;
    }
  | {
      readonly kind: "logout";
      readonly reason?: string;
      readonly from: string;
      readonly sig: string;
    };

type SessionBroadcastPayload =
  | {
      readonly kind: "rotate";
      readonly tokens: AuthTokens;
      readonly policy: AuthTokenRotationPolicy;
    }
  | {
      readonly kind: "logout";
      readonly reason?: string;
    };

async function tokenExpiresAt(token: string | null): Promise<number | undefined> {
  if (!token) {
    return undefined;
  }

  try {
    const claims = await decodeJwt<{ readonly exp?: number }>(token);
    if (typeof claims.exp !== "number") {
      return undefined;
    }
    return claims.exp * 1000;
  } catch {
    return undefined;
  }
}

async function readState(storage: AuthStore): Promise<AuthSessionState> {
  const accessToken = await storage.get();
  const refreshToken = await storage.getRefresh();
  const expiresAt = await tokenExpiresAt(accessToken);

  return {
    accessToken,
    refreshToken,
    ...(expiresAt !== undefined ? { expiresAt } : {}),
  };
}

async function rotateTokensInternal(
  storage: AuthStore,
  tokens: AuthTokens,
  policy: AuthTokenRotationPolicy
): Promise<AuthSessionState> {
  await storage.set(tokens.accessToken);

  if (tokens.refreshToken !== undefined) {
    await storage.setRefresh(tokens.refreshToken);
    return readState(storage);
  }

  if (policy === "clear-refresh-token") {
    await storage.clearRefresh();
    return readState(storage);
  }

  if (policy === "require-refresh-token") {
    const existing = await storage.getRefresh();
    if (!existing) {
      throw new Error("pureq: refresh token is required by rotation policy");
    }
  }

  return readState(storage);
}

/** SEC-H7: HMAC-based broadcast message signing. */
async function signMessage(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const arr = new Uint8Array(sig);
  let result = "";
  for (const byte of arr) {
    result += byte.toString(16).padStart(2, "0");
  }
  return result;
}

async function verifySignature(payload: string, signature: string, secret: string): Promise<boolean> {
  const expected = await signMessage(payload, secret);
  // constant length comparison
  if (expected.length !== signature.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Create a session manager with token storage, event broadcasting, and lifecycle management.
 *
 * Includes: refresh deduplication, rate limiting (SEC-M3), session regeneration (SEC-M1),
 * sliding window (FEAT-M10), idle timeout (FEAT-L5), signed broadcast (SEC-H7).
 */
export function createAuthSessionManager(
  storage: AuthStore,
  options: AuthSessionManagerOptions = {}
): AuthSessionManager {
  let disposed = false;
  let refreshLock: Promise<AuthSessionState> | null = null;
  let lastRefreshAt = 0;
  let lastAccessAt = Date.now();
  const rotationPolicy = options.rotationPolicy ?? "preserve-refresh-token";
  const listeners = new Set<AuthSessionEventListener>();
  const channelName = options.broadcastChannel ?? "pureq:auth:session";
  const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(channelName) : null;
  const auditEvent = options.auditEvent;
  const exporter = options.exporter;
  const instanceId = options.instanceId ?? `session-${generateSecureId(8)}`;
  const minRefreshIntervalMs = options.minRefreshIntervalMs ?? 10_000;
  const slidingWindowMs = options.slidingWindowMs;
  const idleTimeoutMs = options.idleTimeoutMs;
  // SEC-H7: broadcast secret for HMAC signing
  const broadcastSecret = options.broadcastSecret ?? `pureq-bc-${instanceId}-${generateSecureId(16)}`;
  const assertActive = (): void => {
    if (disposed) {
      throw new Error("pureq: session manager has been disposed");
    }
  };

  const notify = (event: AuthSessionEvent): void => {
    void auditEvent?.(event);
    void exporter?.export(event);
    for (const listener of listeners) {
      void listener(event);
    }
  };

  const broadcast = async (message: SessionBroadcastPayload): Promise<void> => {
    if (!channel) {
      return;
    }
    const payload = JSON.stringify(message);
    const sig = await signMessage(payload, broadcastSecret);
    try {
      channel.postMessage({
        ...message,
        from: instanceId,
        sig,
      });
    } catch {
      // Ignore post-dispose async broadcasts.
    }
  };

  if (channel) {
    channel.onmessage = (event) => {
      const message = event.data as SessionBroadcastMessage;
      if (!message || typeof message !== "object") {
        return;
      }

      if (message.from === instanceId) {
        return;
      }

      // SEC-H7: Verify broadcast signature
      const { sig, from, ...payloadFields } = message;
      void verifySignature(JSON.stringify(payloadFields), sig, broadcastSecret).then((valid) => {
        if (!valid) {
          return;
        }

        if (message.kind === "rotate") {
          void rotateTokensInternal(storage, message.tokens, message.policy)
            .then((state) => {
              notify({
                type: "tokens-updated",
                at: Date.now(),
                source: "remote",
                state,
              });
            })
            .catch((error) => {
              notify({
                type: "session-refresh-failed",
                at: Date.now(),
                source: "remote",
                errorMessage: error instanceof Error ? error.message : String(error),
              });
            });
          return;
        }

        if (message.kind === "logout") {
          void storage
            .clear()
            .then(() => storage.clearRefresh())
            .then(() => {
              notify({
                type: "session-logout",
                at: Date.now(),
                source: "remote",
                ...(message.reason !== undefined ? { reason: message.reason } : {}),
              });
            });
        }
      });
    };
  }

  return {
    async getState(): Promise<AuthSessionState> {
      assertActive();
      lastAccessAt = Date.now();
      const state = await readState(storage);

      // FEAT-L5: idle timeout check
      if (idleTimeoutMs !== undefined && Date.now() - lastAccessAt > idleTimeoutMs) {
        return { accessToken: null, refreshToken: null };
      }

      // FEAT-M10: sliding window extension
      if (slidingWindowMs !== undefined && typeof state.expiresAt === "number") {
        const remaining = state.expiresAt - Date.now();
        if (remaining > 0 && remaining < slidingWindowMs) {
          // Extend the session by re-storing the token (triggers new expiry tracking)
          if (state.accessToken) {
            await storage.set(state.accessToken);
          }
        }
      }

      return state;
    },

    async setTokens(tokens: AuthTokens): Promise<void> {
      assertActive();
      const state = await rotateTokensInternal(storage, tokens, rotationPolicy);
      notify({
        type: "tokens-updated",
        at: Date.now(),
        source: "local",
        state,
      });
      void broadcast({ kind: "rotate", tokens, policy: rotationPolicy });
    },

    async rotateTokens(tokens: AuthTokens, policy?: AuthTokenRotationPolicy): Promise<AuthSessionState> {
      assertActive();
      const nextPolicy = policy ?? rotationPolicy;
      const state = await rotateTokensInternal(storage, tokens, nextPolicy);
      notify({
        type: "tokens-updated",
        at: Date.now(),
        source: "local",
        state,
      });
      void broadcast({ kind: "rotate", tokens, policy: nextPolicy });
      return state;
    },

    async clear(): Promise<void> {
      assertActive();
      await storage.clear();
      await storage.clearRefresh();
      notify({
        type: "tokens-cleared",
        at: Date.now(),
        source: "local",
      });
    },

    async logout(reason?: string): Promise<void> {
      assertActive();
      await this.clear();
      notify({
        type: "session-logout",
        at: Date.now(),
        source: "local",
        ...(reason !== undefined ? { reason } : {}),
      });
      void broadcast({
        kind: "logout",
        ...(reason !== undefined ? { reason } : {}),
      });
    },

    async isExpired(): Promise<boolean> {
      assertActive();
      const state = await readState(storage);
      return typeof state.expiresAt === "number" ? state.expiresAt <= Date.now() : false;
    },

    async needsRefresh(thresholdMs = 60_000): Promise<boolean> {
      assertActive();
      const state = await readState(storage);
      if (typeof state.expiresAt !== "number") {
        return false;
      }
      return state.expiresAt - Date.now() <= thresholdMs;
    },

    async refreshIfNeeded(refresh: () => Promise<AuthTokens>, thresholdMs = 60_000): Promise<AuthSessionState> {
      assertActive();
      const shouldRefresh = await this.needsRefresh(thresholdMs);
      if (!shouldRefresh) {
        return this.getState();
      }

      if (refreshLock) {
        return refreshLock;
      }

      // SEC-M3: rate limiting
      const now = Date.now();
      if (now - lastRefreshAt < minRefreshIntervalMs) {
        return this.getState();
      }

      if (!refreshLock) {
        refreshLock = (async () => {
          lastRefreshAt = Date.now();
          const tokens = await refresh();
          const state = await this.rotateTokens(tokens, rotationPolicy);
          notify({
            type: "session-refreshed",
            at: Date.now(),
            source: "local",
            state,
          });
          return state;
        })().finally(() => {
          refreshLock = null;
        });
      }

      return refreshLock;
    },

    /** SEC-M1: Regenerate session — clear and re-initialize with new tokens. */
    async regenerateSession(newTokens: AuthTokens): Promise<AuthSessionState> {
      assertActive();
      await storage.clear();
      await storage.clearRefresh();
      const state = await rotateTokensInternal(storage, newTokens, rotationPolicy);
      notify({
        type: "session-regenerated",
        at: Date.now(),
        source: "local",
        state,
      });
      return state;
    },

    onEvent(listener: AuthSessionEventListener): () => void {
      assertActive();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    dispose(): void {
      if (disposed) {
        return;
      }

      disposed = true;
      listeners.clear();
      if (channel) {
        channel.onmessage = null;
        channel.close();
      }
      // DX-M4: flush before dispose
      void exporter?.flush?.();
      exporter?.dispose?.();
    },
  };
}

export {
  composeSessionEventAudits,
  createConsoleSessionEventAudit,
  createBufferedSessionEventExporter,
} from "./exporters.js";
export type { SessionEventBufferedExporter, SessionEventExporterOptions } from "./exporters.js";