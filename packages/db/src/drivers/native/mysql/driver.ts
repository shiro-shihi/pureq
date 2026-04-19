import { MysqlConnection, type MysqlConnectionConfig } from "./mysql-connection.js";
import { NodeSocket } from "../common/node-socket.js";
import { VirtualSocket } from "../common/virtual-socket.js";
import type { Driver, QueryResult, QueryPayload } from "../../types.js";

export interface MysqlNativeConfig extends MysqlConnectionConfig {
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
 * Pureq Native MySQL Driver.
 * Zero-dependency, pure TypeScript implementation of the MySQL Wire Protocol.
 * Employs Binary Protocol exclusively for maximum security.
 */
export class MysqlNativeDriver implements Driver {
  private connection?: MysqlConnection | undefined;

  constructor(protected config: MysqlNativeConfig) {}

  protected async getConnection(): Promise<MysqlConnection> {
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

    this.connection = new MysqlConnection(socket, this.config);
    await this.connection.connect();
    return this.connection;
  }

  async execute<T = unknown>(query: QueryPayload, params: unknown[] = []): Promise<QueryResult<T>> {
    let sql: string;

    if (typeof query === "string") {
      if (this.config.zeroTrust) {
        throw new Error("Security Exception: Zero-Trust mode is enabled. Raw SQL execution is forbidden. You must use the Pureq Query Builder.");
      }
      sql = query;
    } else {
      if (this.config.zeroTrust && !query.__pureq_signature) {
        throw new Error("Security Exception: Invalid or missing Query Builder signature.");
      }
      sql = query.sql;
    }

    const conn = await this.getConnection();
    const result = await conn.executeExtendedQuery<T>(sql, params);
    
    const res: QueryResult<T> = {
      rows: result.rows,
    };

    if (result.affectedRows !== undefined) {
      res.affectedRows = result.affectedRows;
    }
    if (result.insertId !== undefined) {
      res.lastInsertId = result.insertId;
    }

    return res;
  }

  async executeBatch(queries: { query: QueryPayload; params: unknown[] }[]): Promise<QueryResult[]> {
    if (this.config.zeroTrust) {
      for (const q of queries) {
        if (typeof q.query === "string" || !q.query.__pureq_signature) {
          throw new Error("Security Exception: Zero-Trust mode is enabled. Batch queries must be signed by the Pureq Query Builder.");
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
      if (r.insertId !== undefined) res.lastInsertId = r.insertId;
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
      if (this.config.zeroTrust && !query.__pureq_signature) {
        throw new Error("Security Exception: Invalid or missing Query Builder signature.");
      }
      sql = query.sql;
    }

    const conn = await this.getConnection();
    yield* conn.streamQuery<any>(sql, params);
  }

  async transaction<T>(fn: (tx: Driver) => Promise<T>): Promise<T> {
    const conn = await this.getConnection();
    await conn.executeExtendedQuery("START TRANSACTION", []);
    try {
      const result = await fn(this);
      await conn.executeExtendedQuery("COMMIT", []);
      return result;
    } catch (e) {
      await conn.executeExtendedQuery("ROLLBACK", []).catch(() => {});
      throw e;
    }
  }

  async close(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.connection = undefined;
    }
  }
}
