import type { Middleware, RequestConfig } from "../types/http";
import { markPolicyMiddleware } from "../policy/guardrails";

export interface AuthRefreshOptions {
  /**
   * The status code that triggers the refresh (default: 401).
   */
  readonly status?: number;
  /**
   * Function to refresh the token. Should return the new token string.
   */
  readonly refresh: () => Promise<string>;
  /**
   * Function to update the original request with the new token.
   * Default: updates 'Authorization' header.
   */
  readonly updateRequest?: (req: RequestConfig, newToken: string) => RequestConfig;
  /**
   * Max number of refresh attempts per request (default: 1).
   */
  readonly maxAttempts?: number;
}

/**
 * Middleware for automatic authentication token refreshing.
 * Handles concurrent 401 errors by queuing them during a refresh operation.
 */
export function authRefresh(options: AuthRefreshOptions): Middleware {
  const triggerStatus = options.status ?? 401;
  const maxAttempts = options.maxAttempts ?? 1;
  const updateRequest = options.updateRequest ?? ((req, token) => ({
    ...req,
    headers: {
      ...req.headers,
      "Authorization": `Bearer ${token}`,
    },
  }));

  let refreshPromise: Promise<string> | null = null;

  const middleware: Middleware = async (req, next) => {
    let attempts = 0;
    let currentReq = req;

    while (attempts <= maxAttempts) {
      const response = await next(currentReq);

      if (response.status !== triggerStatus || attempts >= maxAttempts) {
        return response;
      }

      attempts++;

      // Prevent thundering herd: only one refresh at a time
      if (!refreshPromise) {
        refreshPromise = options.refresh().finally(() => {
          refreshPromise = null;
        });
      }

      try {
        const newToken = await refreshPromise;
        currentReq = updateRequest(currentReq, newToken);
      } catch (error) {
        // If refresh itself fails, return the original unauthorized response
        // or throw a wrapped error.
        const authError = new Error(`pureq: token refresh failed`);
        (authError as any).code = "PUREQ_AUTH_REFRESH_FAILED";
        (authError as any).kind = "auth-error";
        (authError as any).cause = error;
        throw authError;
      }
    }

    throw new Error("pureq: auth refresh loop exited unexpectedly");
  };

  return markPolicyMiddleware(middleware, {
    name: "authRefresh",
    kind: "auth",
  });
}
