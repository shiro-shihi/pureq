import type { Middleware } from "@pureq/pureq";
import { markPolicyMiddleware } from "@pureq/pureq";
import type { TokenLifecycleOptions } from "../shared/index.js";
import { buildAuthError } from "../shared/index.js";
import { decodeJwt } from "../jwt/index.js";

export function withTokenLifecycle(options: TokenLifecycleOptions): Middleware {
  const refreshThresholdMs = options.refreshThresholdMs ?? 5 * 60_000;
  let refreshPromise: Promise<string> | null = null;

  const ensureRefresh = async (): Promise<string> => {
    if (!refreshPromise) {
      refreshPromise = options.onRefreshNeeded().finally(() => {
        refreshPromise = null;
      });
    }
    return refreshPromise;
  };

  const middleware: Middleware = async (req, next) => {
    const token = await options.storage.get();
    if (token) {
      let claims: { readonly exp?: number };

      try {
        claims = await decodeJwt<{ readonly exp?: number }>(token);
      } catch (error) {
        throw buildAuthError("PUREQ_AUTH_INVALID_TOKEN", "pureq: failed to inspect token lifecycle", error);
      }

      if (typeof claims.exp === "number") {
        const now = Date.now();
        const expMs = claims.exp * 1000;
        if (expMs <= now) {
          options.onExpired?.();
          try {
            await options.storage.set(await ensureRefresh());
          } catch (error) {
            throw buildAuthError("PUREQ_AUTH_EXPIRED", "pureq: token expired", error);
          }
        } else if (expMs - now <= refreshThresholdMs) {
          options.onStale?.();
          try {
            await options.storage.set(await ensureRefresh());
          } catch (error) {
            throw buildAuthError("PUREQ_AUTH_REFRESH_FAILED", "pureq: token refresh failed", error);
          }
        }
      }
    }

    return next(req);
  };

  return markPolicyMiddleware(middleware, { name: "withTokenLifecycle", kind: "auth" });
}
