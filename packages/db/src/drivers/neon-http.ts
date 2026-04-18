import { DBError, type DBErrorCode } from "../errors/db-error.js";
import type { Driver, QueryResult, EdgeDriver } from "./types.js";

export interface NeonConfig {
  url: string;
  authToken: string;
}

export class NeonHttpDriver implements EdgeDriver {
  constructor(private readonly config: NeonConfig) {}

  async execute<T = unknown>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    try {
      const response = await fetch(`${this.config.url}/sql`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.config.authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: sql,
          params: params,
        }),
      });

      if (!response.ok) {
        const error = await response.json() as any;
        throw this.normalizeError(error);
      }

      const data = await response.json() as any;
      
      // Neon HTTP API return format usually involves rows and fields
      return {
        rows: data.rows as T[],
        affectedRows: data.rowCount,
      };
    } catch (e: any) {
      throw this.normalizeError(e);
    }
  }

  async transaction<T>(fn: (tx: Driver) => Promise<T>): Promise<T> {
    // Neon HTTP often supports batching but true interactive transactions 
    // over HTTP are limited (usually requires session management).
    // For now, we implement it as a batch or throw if not supported.
    throw new Error("Interactive transactions are not supported in NeonHttpDriver. Use batch() for atomic operations.");
  }

  async batch?(queries: { sql: string; params?: unknown[] }[]): Promise<QueryResult[]> {
    // Neon-specific batch implementation would go here
    const results: QueryResult[] = [];
    for (const q of queries) {
      results.push(await this.execute(q.sql, q.params));
    }
    return results;
  }

  private normalizeError(e: any): DBError {
    if (e instanceof DBError) return e;
    
    // Neon specific error normalization logic
    let code: DBErrorCode = "UNKNOWN_ERROR";
    const message = e.message || "Neon HTTP Error";

    if (e.code === "23505") code = "UNIQUE_VIOLATION";
    // ... more mapping

    return new DBError(code, message, e);
  }
}
