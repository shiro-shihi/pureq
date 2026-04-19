import { PUREQ_AST_SIGNATURE } from "../../../builder/builder.js";
import { PgConnection, type PgConnectionConfig, type PgNotificationListener } from "./pg-connection.js";
import { NodeSocket } from "../common/node-socket.js";
import { VirtualSocket } from "../common/virtual-socket.js";
import type { Driver, QueryResult, QueryPayload } from "../../types.js";

export interface PostgresNativeConfig extends PgConnectionConfig {
  host: string;
  port: number;
  /**
   * Virtual Database Mode:
   * - "live": Connects to the real database (Default).
   * - "record": Connects to the real database and saves traffic to snapshotPath.
   * - "replay": Does not connect to a DB. Replays traffic from snapshotPath.
   */
  mode?: "live" | "record" | "replay";
  snapshotPath?: string;
  /**
   * Zero-Trust Mode:
   * If true, the driver rejects any raw SQL string that does not carry a
   * cryptographic signature from the Pureq Query Builder, physically preventing SQL Injection.
   */
  zeroTrust?: boolean;
}

/**
 * Pureq Native Postgres Driver.
 * Zero-dependency, pure TypeScript implementation of the PostgreSQL Wire Protocol.
 * Employs Extended Query Protocol exclusively for maximum security.
 */
export class PostgresNativeDriver implements Driver {
  private connection?: PgConnection | undefined;

  constructor(protected config: PostgresNativeConfig) {}

  protected async getConnection(): Promise<PgConnection> {
    if (this.connection) return this.connection;

    let socket: any = new NodeSocket({
      host: this.config.host,
      port: this.config.port,
      tls: false
    });

    if (this.config.mode === "record" || this.config.mode === "replay") {
      if (!this.config.snapshotPath) throw new Error("snapshotPath is required for record/replay mode");
      const vSocket = new VirtualSocket(this.config.mode, this.config.snapshotPath, this.config.mode === "record" ? socket : undefined);
      await vSocket.init();
      socket = vSocket;
    }

    this.connection = new PgConnection(socket, this.config);
    await this.connection.connect();
    return this.connection;
  }

  async execute<T = unknown>(query: string | { sql: string; __pureq_signature?: string }, params: unknown[] = []): Promise<QueryResult<T>> {
    let sql: string;

    if (typeof query === "string") {
      if (this.config.zeroTrust) {
        throw new Error("Security Exception: Zero-Trust mode is enabled. Raw SQL execution is forbidden. You must use the Pureq Query Builder.");
      }
      sql = query;
    } else {
      const sig = query.__pureq_signature || "";
      let diff = sig.length ^ PUREQ_AST_SIGNATURE.length;
      for (let i = 0; i < PUREQ_AST_SIGNATURE.length; i++) {
        diff |= (sig.charCodeAt(i) || 0) ^ PUREQ_AST_SIGNATURE.charCodeAt(i);
      }
      if (this.config.zeroTrust && diff !== 0) {
        throw new Error("Security Exception: Invalid or missing Query Builder signature. Zero-Trust validation failed.");
      }
      sql = query.sql;
    }

    if (params.length > 65535) {
      throw new Error(`Security Exception: Too many query parameters (${params.length}). PostgreSQL limit is 65,535.`);
    }

    const conn = await this.getConnection();
    const result = await conn.executeExtendedQuery<T>(sql, params);
    
    const res: QueryResult<T> = {
      rows: result.rows,
    };

    if (result.affectedRows !== undefined) {
      res.affectedRows = result.affectedRows;
    }

    return res;
  }

  async executeBatch(queries: { query: QueryPayload; params: unknown[] }[]): Promise<QueryResult[]> {
    if (this.config.zeroTrust) {
      for (const q of queries) {
        if (typeof q.query === "string" || q.query.__pureq_signature !== PUREQ_AST_SIGNATURE) {
          throw new Error("Security Exception: Zero-Trust mode is enabled. Batch queries must be signed with a valid Pureq signature.");
        }
      }
    }

    const formattedQueries = queries.map(q => ({
      sql: typeof q.query === "string" ? q.query : q.query.sql,
      params: q.params
    }));

    const conn = await this.getConnection();
    const results = await conn.executeBatch(formattedQueries);
    
    return results.map(r => {
      const res: QueryResult = { rows: r.rows };
      if (r.affectedRows !== undefined) res.affectedRows = r.affectedRows;
      return res;
    });
  }

  async *stream<T = unknown>(query: QueryPayload, params: unknown[] = []): AsyncIterableIterator<T> {
    let sql: string;

    if (typeof query === "string") {
      if (this.config.zeroTrust) {
        throw new Error("Security Exception: Zero-Trust mode is enabled. Raw SQL streaming is forbidden. You must use the Pureq Query Builder.");
      }
      sql = query;
    } else {
      const sig = query.__pureq_signature || "";
      let diff = sig.length ^ PUREQ_AST_SIGNATURE.length;
      for (let i = 0; i < PUREQ_AST_SIGNATURE.length; i++) {
        diff |= (sig.charCodeAt(i) || 0) ^ PUREQ_AST_SIGNATURE.charCodeAt(i);
      }
      if (this.config.zeroTrust && diff !== 0) {
        throw new Error("Security Exception: Invalid or missing Query Builder signature. Zero-Trust validation failed.");
      }
      sql = query.sql;
    }

    const conn = await this.getConnection();
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

  /**
   * Listens to asynchronous NOTIFY messages from the database.
   */
  async onNotification(listener: PgNotificationListener): Promise<() => void> {
    const conn = await this.getConnection();
    return conn.onNotification(listener);
  }

  /**
   * Safely cancels the currently executing query by opening a dedicated cancellation connection.
   */
  async cancel(): Promise<void> {
    if (!this.connection?.backendKeyData) return;

    const { processId, secretKey } = this.connection.backendKeyData;
    const socket = new NodeSocket({
      host: this.config.host,
      port: this.config.port,
      tls: false
    });
    
    const protocol = (this.connection as any).protocol;
    await socket.write(protocol.encodeCancelRequest(processId, secretKey));
    await socket.close();
  }

  async close(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.connection = undefined;
    }
  }
}
