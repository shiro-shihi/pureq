import type { Driver, QueryResult } from "./types.js";
import { normalizeSqliteError } from "./utils.js";

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
      throw normalizeSqliteError(e);
    }
  }

  async transaction<T>(fn: (tx: Driver) => Promise<T>): Promise<T> {
    const transaction = this.db.transaction((innerFn: () => Promise<T>) => innerFn());
    try {
        return await transaction(async () => {
            return await fn(this);
        });
    } catch (e: any) {
        throw normalizeSqliteError(e);
    }
  }
}
