import type { Driver, QueryResult, QueryPayload } from "../types.js";
import { normalizePostgresError } from "../utils.js";

interface PostgresClient {
  query(sql: string, params: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
  connect?(): Promise<PostgresClient & { release(): void }>;
}

export class PostgresDriver implements Driver {
  constructor(private readonly client: PostgresClient) {}

  async execute<T = unknown>(query: QueryPayload, params: unknown[] = []): Promise<QueryResult<T>> {
    const sql = typeof query === "string" ? query : query.sql;

    // Security: PostgreSQL has a limit of 65,535 (uint16) parameters per query.
    // Count all parameters including elements in nested arrays (for IN clauses).
    const totalParams = params.reduce((acc: number, p) => acc + (Array.isArray(p) ? p.length : 1), 0);
    if (totalParams > 65535) {
      throw new Error(`Security Exception: Too many query parameters (${totalParams}). PostgreSQL limit is 65,535.`);
    }

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
      throw normalizePostgresError(e);
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
}
