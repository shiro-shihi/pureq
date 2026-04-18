import { DBError, type DBErrorCode } from "../errors/db-error.js";
import type { Driver, QueryResult } from "./types.js";

interface PostgresClient {
  query(sql: string, params: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
  connect?(): Promise<PostgresClient & { release(): void }>;
}

export class PostgresDriver implements Driver {
  constructor(private readonly client: PostgresClient) {}

  async execute<T = unknown>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    try {
      const result = await this.client.query(sql, params);
      const res: QueryResult<T> = {
        rows: result.rows as T[],
      };
      if (result.rowCount !== null && result.rowCount !== undefined) {
        res.affectedRows = result.rowCount;
      }
      return res;
    } catch (e: any) {
      throw this.normalizeError(e);
    }
  }

  async transaction<T>(fn: (tx: Driver) => Promise<T>): Promise<T> {
    if (this.client.connect) {
      const txClient = await this.client.connect();
      const txDriver = new PostgresDriver(txClient);
      
      await txDriver.execute("BEGIN");
      try {
        const result = await fn(txDriver);
        await txDriver.execute("COMMIT");
        return result;
      } catch (e) {
        await txDriver.execute("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        txClient.release();
      }
    }

    await this.execute("BEGIN");
    try {
      const result = await fn(this);
      await this.execute("COMMIT");
      return result;
    } catch (e) {
      await this.execute("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  private normalizeError(e: any): DBError {
    if (e instanceof DBError) return e;

    let code: DBErrorCode = "UNKNOWN_ERROR";
    let message = e.message || "Unknown database error";
    let retryable = false;

    const pgCode = e.code;

    switch (pgCode) {
      case "23505":
        code = "UNIQUE_VIOLATION";
        break;
      case "23503":
        code = "FOREIGN_KEY_VIOLATION";
        break;
      case "23502":
        code = "NOT_NULL_VIOLATION";
        break;
      case "42P01":
      case "42601":
        code = "SYNTAX_ERROR";
        break;
      case "57P01":
      case "57P02":
      case "57P03":
        code = "CONNECTION_FAILURE";
        retryable = true;
        break;
      case "40001":
      case "40P01":
        retryable = true;
        break;
    }

    return new DBError(code, message, e, retryable);
  }
}
