import type { Driver, QueryResult, EdgeDriver } from "./types.js";
import { normalizePostgresError } from "./utils.js";

/**
 * Neon HTTP Driver implementation using @neondatabase/serverless.
 */
export class NeonHttpDriver implements EdgeDriver {
  constructor(private readonly client: any) {}

  async execute<T = unknown>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    try {
      const result = await this.client.query(sql, params);
      
      return {
        rows: result.rows || [],
        affectedRows: result.rowCount,
      };
    } catch (e: any) {
      throw normalizePostgresError(e);
    }
  }

  async transaction<T>(fn: (tx: Driver) => Promise<T>): Promise<T> {
    try {
      return await this.client.transaction(async (tx: any) => {
        const txDriver: Driver = {
          execute: async (sql, params) => {
            try {
              const res = await tx.query(sql, params);
              return { rows: res.rows, affectedRows: res.rowCount };
            } catch (innerE) {
              throw normalizePostgresError(innerE);
            }
          },
          transaction: (innerFn) => innerFn(txDriver)
        };
        return await fn(txDriver);
      });
    } catch (e: any) {
      throw normalizePostgresError(e);
    }
  }
}
