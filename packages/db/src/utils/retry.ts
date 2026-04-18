import type { Driver, QueryResult } from "../drivers/types.js";

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  shouldRetry?: (error: any) => boolean;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelay: 100,
  maxDelay: 3000,
  shouldRetry: (error: any) => {
    const msg = String(error?.message || "").toLowerCase();
    return (
      msg.includes("deadlock") ||
      msg.includes("timeout") ||
      msg.includes("connection lost") ||
      msg.includes("too many clients") ||
      msg.includes("socket hang up")
    );
  },
};

/**
 * Wraps a driver with automatic retry logic for transient errors.
 */
export function withRetry(driver: Driver, options: RetryOptions = {}): Driver {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };

  const executeWithRetry = async <T>(
    sql: string,
    params?: unknown[],
    attempt = 0
  ): Promise<QueryResult<T>> => {
    try {
      return await driver.execute<T>(sql, params);
    } catch (error) {
      if (attempt < opts.maxRetries && opts.shouldRetry(error)) {
        const delay = Math.min(
          opts.baseDelay * Math.pow(2, attempt),
          opts.maxDelay
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return executeWithRetry(sql, params, attempt + 1);
      }
      throw error;
    }
  };

  return {
    execute: (sql, params) => executeWithRetry(sql, params),
    transaction: (fn) => driver.transaction(fn),
  };
}
