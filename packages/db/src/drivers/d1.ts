import type { Driver, QueryResult, EdgeDriver } from "./types.js";
import { normalizeSqliteError } from "./utils.js";

/**
 * Cloudflare D1 Driver implementation.
 * Expects a D1Database object from the Cloudflare Workers environment.
 */
export class D1Driver implements EdgeDriver {
  constructor(private readonly db: any) {}

  async execute<T = unknown>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    try {
      const stmt = this.db.prepare(sql).bind(...params);
      const result = await stmt.all();
      
      return {
        rows: result.results || [],
        affectedRows: result.meta?.changes,
        lastInsertId: result.meta?.last_row_id,
      };
    } catch (e: any) {
      throw normalizeSqliteError(e); // D1 is SQLite based
    }
  }

  async transaction<T>(fn: (tx: Driver) => Promise<T>): Promise<T> {
    return fn(this);
  }

  async batch(queries: { sql: string; params?: unknown[] }[]): Promise<QueryResult[]> {
    try {
      const stmts = queries.map(q => this.db.prepare(q.sql).bind(...(q.params || [])));
      const results = await this.db.batch(stmts);
      
      return results.map((r: any) => ({
        rows: r.results || [],
        affectedRows: r.meta?.changes,
        lastInsertId: r.meta?.last_row_id,
      }));
    } catch (e: any) {
      throw normalizeSqliteError(e);
    }
  }
}
