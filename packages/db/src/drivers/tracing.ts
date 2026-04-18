import type { Driver, QueryResult } from "./types.js";

/**
 * A wrapper driver that adds tracing capabilities (e.g. OpenTelemetry).
 */
export class TracingDriver implements Driver {
  constructor(
    private readonly inner: Driver,
    private readonly options: {
      onBeforeQuery?: (sql: string, params: unknown[]) => void;
      onAfterQuery?: (sql: string, params: unknown[], result: QueryResult) => void;
      onError?: (sql: string, params: unknown[], error: unknown) => void;
    } = {}
  ) {}

  async execute<T = unknown>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    this.options.onBeforeQuery?.(sql, params);
    try {
      const result = await this.inner.execute<T>(sql, params);
      this.options.onAfterQuery?.(sql, params, result);
      return result;
    } catch (e) {
      this.options.onError?.(sql, params, e);
      throw e;
    }
  }

  async transaction<T>(fn: (tx: Driver) => Promise<T>): Promise<T> {
    return this.inner.transaction(async (innerTx) => {
        const tracingTx = new TracingDriver(innerTx, this.options);
        return await fn(tracingTx);
    });
  }
}
