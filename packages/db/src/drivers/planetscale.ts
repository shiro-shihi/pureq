import type { Driver, QueryResult, EdgeDriver } from "./types.js";
import { normalizeMysqlError } from "./utils.js";

/**
 * PlanetScale Driver implementation using @planetscale/database.
 */
export class PlanetScaleDriver implements EdgeDriver {
  constructor(private readonly client: any) {}

  async execute<T = unknown>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    try {
      const result = await this.client.execute(sql, params);
      
      return {
        rows: result.rows || [],
        affectedRows: result.rowsAffected,
        lastInsertId: result.insertId,
      };
    } catch (e: any) {
      throw normalizeMysqlError(e);
    }
  }

  async transaction<T>(fn: (tx: Driver) => Promise<T>): Promise<T> {
    try {
      return await this.client.transaction(async (tx: any) => {
        const txDriver: Driver = {
          execute: async (sql, params) => {
            try {
              const res = await tx.execute(sql, params);
              return { rows: res.rows, affectedRows: res.rowsAffected, lastInsertId: res.insertId };
            } catch (innerE) {
              throw normalizeMysqlError(innerE);
            }
          },
          transaction: (innerFn) => innerFn(txDriver)
        };
        return await fn(txDriver);
      });
    } catch (e: any) {
      throw normalizeMysqlError(e);
    }
  }
}
