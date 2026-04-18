import { DBError, type DBErrorCode } from "../errors/db-error.js";
import type { Driver, QueryResult } from "./types.js";

interface BetterSqlite3Database {
  prepare(sql: string): any;
  transaction(fn: Function): any;
}

export class BetterSqlite3Driver implements Driver {
  constructor(private readonly db: BetterSqlite3Database) {}

  async execute<T = unknown>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    try {
      const stmt = this.db.prepare(sql);
      
      if (sql.trim().toUpperCase().startsWith("SELECT")) {
        const rows = stmt.all(...(params as any[])) as T[];
        return { rows };
      } else {
        const info = stmt.run(...(params as any[]));
        return {
          rows: [],
          affectedRows: info.changes,
          lastInsertId: info.lastInsertRowid,
        };
      }
    } catch (e: any) {
      throw this.normalizeError(e);
    }
  }

  async transaction<T>(fn: (tx: Driver) => Promise<T>): Promise<T> {
    const transaction = this.db.transaction((innerFn: () => Promise<T>) => innerFn());
    try {
        return await transaction(async () => {
            return await fn(this);
        });
    } catch (e: any) {
        throw this.normalizeError(e);
    }
  }

  private normalizeError(e: any): DBError {
    if (e instanceof DBError) return e;

    let code: DBErrorCode = "UNKNOWN_ERROR";
    let message = e.message || "Unknown database error";
    let retryable = false;

    const sqliteMessage = e.message || "";

    if (sqliteMessage.includes("UNIQUE constraint failed")) {
      code = "UNIQUE_VIOLATION";
    } else if (sqliteMessage.includes("NOT NULL constraint failed")) {
      code = "NOT_NULL_VIOLATION";
    } else if (sqliteMessage.includes("FOREIGN KEY constraint failed")) {
      code = "FOREIGN_KEY_VIOLATION";
    } else if (sqliteMessage.includes("syntax error")) {
      code = "SYNTAX_ERROR";
    } else if (sqliteMessage.includes("database is locked")) {
      code = "CONNECTION_FAILURE";
      retryable = true;
    }

    return new DBError(code, message, e, retryable);
  }
}
