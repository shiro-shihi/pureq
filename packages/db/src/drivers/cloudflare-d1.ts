import { DBError, type DBErrorCode } from "../errors/db-error.js";
import type { Driver, QueryResult, EdgeDriver } from "./types.js";

/**
 * Cloudflare D1 Database interface (subset)
 */
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(queries: D1PreparedStatement[]): Promise<D1Result[]>;
}

export interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  error?: string;
  meta: {
    changes?: number;
    last_row_id?: number;
  };
}

export class CloudflareD1Driver implements EdgeDriver {
  constructor(private readonly d1: D1Database) {}

  async execute<T = unknown>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    try {
      const stmt = this.d1.prepare(sql).bind(...(params as any[]));
      
      if (sql.trim().toUpperCase().startsWith("SELECT")) {
        const result = await stmt.all<T>();
        return {
          rows: result.results || [],
        };
      } else {
        const result = await stmt.run();
        const res: QueryResult<T> = { rows: [] };
        if (result.meta.changes !== undefined) res.affectedRows = result.meta.changes;
        if (result.meta.last_row_id !== undefined) res.lastInsertId = result.meta.last_row_id;
        return res;
      }
    } catch (e: any) {
      throw this.normalizeError(e);
    }
  }

  async transaction<T>(fn: (tx: Driver) => Promise<T>): Promise<T> {
    throw new Error("Interactive transactions are not supported in CloudflareD1Driver. Use batch() logic.");
  }

  private normalizeError(e: any): DBError {
    if (e instanceof DBError) return e;
    
    let code: DBErrorCode = "UNKNOWN_ERROR";
    const message = e.message || "D1 Error";

    if (message.includes("UNIQUE constraint failed")) code = "UNIQUE_VIOLATION";

    return new DBError(code, message, e);
  }
}
