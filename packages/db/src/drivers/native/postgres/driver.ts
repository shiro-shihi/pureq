import { PUREQ_AST_SIGNATURE } from "../../../builder/builder.js";
import { PgConnection, type PgConnectionConfig, type PgNotificationListener } from "./pg-connection.js";
import { PureqConnection } from "@pureq/connectivity";
import type { Driver, QueryResult, QueryPayload } from "../../types.js";

export interface PostgresNativeConfig extends PgConnectionConfig {
  host: string;
  port: number;
  zeroTrust?: boolean;
}

/**
 * Pureq Universal Postgres Driver
 * 
 * 100% Dependency-Free. 100% Platform-Agnostic.
 * Self-manages connectivity via @pureq/connectivity.
 */
export class PostgresNativeDriver implements Driver {
  private connection?: PgConnection;

  constructor(
    private config: PostgresNativeConfig
  ) {}

  protected async getConnection(): Promise<PgConnection> {
    if (this.connection) return this.connection;

    const pureqConn = await PureqConnection.connect({
        host: this.config.host,
        port: this.config.port
    });

    this.connection = new PgConnection(pureqConn, this.config);
    await this.connection.connect();
    return this.connection;
  }

  async execute<T = unknown>(query: QueryPayload, params: unknown[] = []): Promise<QueryResult<T>> {
    let sql: string;

    if (typeof query === "string") {
      if (this.config.zeroTrust) {
        throw new Error("Security Exception: Zero-Trust mode is enabled. Raw SQL execution is forbidden.");
      }
      sql = query;
    } else {
      // Restore Constant-time signature verification
      const sig = query.__pureq_signature || "";
      let diff = sig.length ^ PUREQ_AST_SIGNATURE.length;
      for (let i = 0; i < PUREQ_AST_SIGNATURE.length; i++) {
        diff |= (sig.charCodeAt(i) || 0) ^ PUREQ_AST_SIGNATURE.charCodeAt(i);
      }
      if (this.config.zeroTrust && diff !== 0) {
        throw new Error("Security Exception: Invalid or missing Query Builder signature.");
      }
      sql = query.sql;
    }

    if (params.length > 65535) {
      throw new Error(`Security Exception: Too many query parameters (${params.length}). PostgreSQL limit is 65,535.`);
    }

    const conn = await this.getConnection();
    const result = await conn.executeExtendedQuery<T>(sql, params);
    return { rows: result.rows, affectedRows: result.affectedRows };
  }

  async executeBatch(queries: { query: QueryPayload; params: unknown[] }[]): Promise<QueryResult[]> {
    const results: QueryResult[] = [];
    for (const q of queries) {
        results.push(await this.execute(q.query, q.params));
    }
    return results;
  }

  async *stream<T = unknown>(query: QueryPayload, params: unknown[] = []): AsyncIterableIterator<T> {
    const conn = await this.getConnection();
    const sql = typeof query === "string" ? query : query.sql;
    yield* conn.streamQuery<T>(sql, params);
  }

  async transaction<T>(fn: (tx: Driver) => Promise<T>): Promise<T> {
    const conn = await this.getConnection();
    await conn.executeExtendedQuery("BEGIN", []);
    try {
      const result = await fn(this);
      await conn.executeExtendedQuery("COMMIT", []);
      return result;
    } catch (e) {
      await conn.executeExtendedQuery("ROLLBACK", []).catch(() => {});
      throw e;
    }
  }

  async onNotification(listener: PgNotificationListener): Promise<() => void> {
    const conn = await this.getConnection();
    return conn.onNotification(listener);
  }

  async close(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
    }
  }
}
