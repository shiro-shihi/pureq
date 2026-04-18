import { DBError } from "../errors/db-error.js";
import { PgProtocol, type FieldDescription } from "../protocol/pg-wire.js";
import type { Driver, QueryResult } from "./types.js";

export interface PgTransport {
  send(data: Uint8Array): Promise<void>;
  receive(): AsyncIterableIterator<Uint8Array>;
  close(): Promise<void>;
}

export interface PurePostgresConfig {
  user: string;
  database: string;
  password?: string;
}

export class PurePostgresDriver implements Driver {
  private protocol = new PgProtocol();
  private isConnected = false;

  constructor(
    private readonly transport: PgTransport,
    private readonly config: PurePostgresConfig
  ) {}

  async connect(): Promise<void> {
    if (this.isConnected) return;

    await this.transport.send(this.protocol.encodeStartupMessage(this.config.user, this.config.database));

    for await (const chunk of this.transport.receive()) {
      let offset = 0;
      while (offset < chunk.length) {
        const decoded = this.protocol.decodeMessage(chunk.slice(offset));
        if (!decoded) break;
        const { message, consumed } = decoded;
        offset += consumed;

        switch (message.type) {
          case "R": {
            const view = new DataView(message.data.buffer, message.data.byteOffset);
            const authType = view.getInt32(0);
            if (authType === 0) {
                // Auth OK
            } else if (authType === 3) {
              if (!this.config.password) throw new Error("Database requires password but none provided");
              await this.transport.send(this.protocol.encodePassword(this.config.password));
            } else {
              throw new Error(`Unsupported authentication type: ${authType}`);
            }
            break;
          }
          case "S":
          case "K":
          case "N":
            break;
          case "Z":
            this.isConnected = true;
            return;
          case "E": {
            const errDetails = this.protocol.parseErrorResponse(message.data);
            throw new DBError("CONNECTION_FAILURE", `Authentication failed: ${errDetails.message ?? "Unknown error"}`, errDetails);
          }
        }
      }
    }
  }

  async execute<T = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
    if (!this.isConnected) await this.connect();

    const statementName = "";
    const portalName = "";

    const messages = [
      this.protocol.encodeParse(statementName, sql),
      this.protocol.encodeBind(portalName, statementName, params, [1]),
      this.protocol.encodeDescribe("P", portalName),
      this.protocol.encodeExecute(portalName, 0),
      this.protocol.encodeSync()
    ];

    const totalLength = messages.reduce((sum, msg) => sum + msg.length, 0);
    const payload = new Uint8Array(totalLength);
    let payloadOffset = 0;
    for (const msg of messages) {
      payload.set(msg, payloadOffset);
      payloadOffset += msg.length;
    }

    await this.transport.send(payload);

    const rows: T[] = [];
    let fields: FieldDescription[] = [];
    let commandComplete = false;
    let affectedRows = 0;

    for await (const chunk of this.transport.receive()) {
      let readOffset = 0;
      while (readOffset < chunk.length) {
        const decoded = this.protocol.decodeMessage(chunk.slice(readOffset));
        if (!decoded) break;

        const { message, consumed } = decoded;
        readOffset += consumed;

        switch (message.type) {
          case "T":
            fields = this.protocol.parseRowDescription(message.data);
            break;
          case "D": {
            const rowValues = this.protocol.parseDataRow(message.data, fields);
            const rowObj: Record<string, any> = {};
            for (let i = 0; i < fields.length; i++) {
              const field = fields[i];
              if (field) {
                rowObj[field.name] = rowValues[i];
              }
            }
            rows.push(rowObj as unknown as T);
            break;
          }
          case "C": {
            commandComplete = true;
            const tag = new TextDecoder().decode(message.data).replace(/\0$/, "");
            const parts = tag.split(" ");
            if (parts.length > 1) {
               const lastNum = parseInt(parts[parts.length - 1] ?? "0", 10);
               if (!isNaN(lastNum)) affectedRows = lastNum;
            }
            break;
          }
          case "E": {
            const errDetails = this.protocol.parseErrorResponse(message.data);
            throw new DBError(this.mapSqlStateToCode(errDetails.code ?? ""), errDetails.message ?? "Database error", errDetails);
          }
          case "Z":
            if (commandComplete) return { rows, affectedRows };
            break;
        }
      }
      if (commandComplete) break;
    }

    return { rows, affectedRows };
  }

  private mapSqlStateToCode(sqlState: string): any {
    if (sqlState.startsWith("23505")) return "UNIQUE_VIOLATION";
    if (sqlState.startsWith("23502")) return "NOT_NULL_VIOLATION";
    if (sqlState.startsWith("23503")) return "FOREIGN_KEY_VIOLATION";
    if (sqlState.startsWith("42")) return "SYNTAX_ERROR";
    if (sqlState.startsWith("08")) return "CONNECTION_FAILURE";
    return "UNKNOWN_ERROR";
  }

  async transaction<T>(fn: (tx: Driver) => Promise<T>): Promise<T> {
    await this.execute("BEGIN");
    try {
      const result = await fn(this);
      await this.execute("COMMIT");
      return result;
    } catch (e) {
      await this.execute("ROLLBACK");
      throw e;
    }
  }
}
