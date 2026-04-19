import { PgProtocol, type FieldDescription, type PgMessage, type PgNotification } from "../../../protocol/pg-wire.js";
import { ScramSha256 } from "./scram.js";
import { BufferReader, type PureqSocket } from "../common/socket.js";
import { createLazyRowProxy } from "./lazy-row.js";
import { DBError, type DBErrorCode } from "../../../errors/db-error.js";

export interface PgConnectionConfig {
  user: string;
  database: string;
  password?: string;
  ssl?: boolean | "require" | "prefer";
}

export type PgNotificationListener = (notification: PgNotification) => void;

export class PgConnection {
  private protocol = new PgProtocol();
  private reader = new BufferReader();
  private isConnected = false;
  private notificationListeners: Set<PgNotificationListener> = new Set();
  
  public backendKeyData?: { processId: number, secretKey: number } | undefined;
  public parameters: Record<string, string> = {};

  constructor(
    private readonly socket: PureqSocket,
    private readonly config: PgConnectionConfig
  ) {}

  onNotification(listener: PgNotificationListener): () => void {
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;

    if (this.config.ssl) {
      await this.socket.write(this.protocol.encodeSSLRequest());
      const response = await this.readBytes(1);
      const answer = String.fromCharCode(response[0]!);
      
      if (answer === 'S') {
        if (this.socket.upgradeTls) {
          await this.socket.upgradeTls({ host: "localhost" });
        } else {
          throw new Error("Socket implementation does not support TLS upgrade");
        }
      } else if (this.config.ssl === "require") {
        throw new Error("Server does not support SSL, but ssl=require was specified");
      }
    }

    await this.socket.write(this.protocol.encodeStartupMessage(this.config.user, this.config.database));

    while (true) {
      const message = await this.readMessage();
      
      switch (message.type) {
        case "R": // AuthenticationRequest
          await this.handleAuthentication(message.data);
          break;
        case "S": // ParameterStatus
          this.handleParameterStatus(message.data);
          break;
        case "K": // BackendKeyData
          this.handleBackendKeyData(message.data);
          break;
        case "A": // NotificationResponse
          this.handleNotification(message.data);
          break;
        case "Z": // ReadyForQuery
          this.isConnected = true;
          return;
        case "E": // ErrorResponse
          const err = this.protocol.parseErrorResponse(message.data);
          throw new DBError("CONNECTION_FAILURE", `Authentication failed: ${err.message ?? "Unknown error"}`, err);
      }
    }
  }

  private async handleAuthentication(data: Uint8Array): Promise<void> {
    const view = new DataView(data.buffer, data.byteOffset);
    const authType = view.getInt32(0);

    if (authType === 0) {
      return;
    } else if (authType === 3) {
      if (!this.config.password) throw new Error("Database requires password but none provided");
      await this.socket.write(this.protocol.encodePassword(this.config.password));
    } else if (authType === 10) {
      if (!this.config.password) throw new Error("Database requires SCRAM password but none provided");
      
      const scram = new ScramSha256(this.config.user, this.config.password);
      const clientFirst = scram.createClientFirstMessage();
      await this.socket.write(this.protocol.encodeSASLInitialResponse("SCRAM-SHA-256", clientFirst));
      
      const nextMsg = await this.readMessage();
      if (nextMsg.type === 'E') {
         const err = this.protocol.parseErrorResponse(nextMsg.data);
         throw new Error(`SASL Auth failed: ${err.message}`);
      }
      const serverFirst = new TextDecoder().decode(nextMsg.data.slice(4));
      const clientFinal = await scram.parseServerFirstMessage(serverFirst);
      await this.socket.write(this.protocol.encodeSASLResponse(clientFinal));

      const finalMsg = await this.readMessage();
      const serverFinal = new TextDecoder().decode(finalMsg.data.slice(4));
      await scram.verifyServerFinalMessage(serverFinal);
      
      const okMsg = await this.readMessage();
      if (okMsg.type !== 'R' || new DataView(okMsg.data.buffer, okMsg.data.byteOffset).getInt32(0) !== 0) {
         throw new Error("Expected Auth OK");
      }
    } else {
      throw new Error(`Unsupported authentication type: ${authType}`);
    }
  }

  private handleParameterStatus(data: Uint8Array) {
    let offset = 0;
    let nullIdx = data.indexOf(0, offset);
    if (nullIdx === -1) return;
    const name = new TextDecoder().decode(data.slice(offset, nullIdx));
    offset = nullIdx + 1;
    nullIdx = data.indexOf(0, offset);
    if (nullIdx === -1) return;
    const value = new TextDecoder().decode(data.slice(offset, nullIdx));
    this.parameters[name] = value;
  }

  private handleBackendKeyData(data: Uint8Array) {
    const view = new DataView(data.buffer, data.byteOffset);
    this.backendKeyData = {
      processId: view.getInt32(0),
      secretKey: view.getInt32(4)
    };
  }

  private handleNotification(data: Uint8Array) {
    const notification = this.protocol.parseNotification(data);
    for (const listener of this.notificationListeners) {
      try {
        listener(notification);
      } catch (e) {
        console.error("Error in PG notification listener:", e);
      }
    }
  }

  private preparedStatements = new Map<string, { name: string, fields: FieldDescription[] }>();
  private stmtCounter = 0;

  private async prepareAndDescribe(sql: string): Promise<{ name: string, fields: FieldDescription[] }> {
    const cached = this.preparedStatements.get(sql);
    if (cached) return cached;

    const stmtName = `ps_${this.stmtCounter++}`;
    const messages = [
      this.protocol.encodeParse(stmtName, sql),
      this.protocol.encodeDescribe("S", stmtName),
      this.protocol.encodeSync()
    ];

    await this.socket.write(this.concatMessages(messages));

    let fields: FieldDescription[] = [];
    while (true) {
      const msg = await this.readMessage();
      if (msg.type === "T") {
        fields = this.protocol.parseRowDescription(msg.data);
      } else if (msg.type === "E") {
        const err = this.protocol.parseErrorResponse(msg.data);
        await this.drainUntilReadyForQuery();
        throw new DBError("SYNTAX_ERROR", `Prepare failed: ${err.message}`, err);
      } else if (msg.type === "Z") {
        break;
      }
    }

    const result = { name: stmtName, fields };
    this.preparedStatements.set(sql, result);
    return result;
  }

  private concatMessages(messages: Uint8Array[]): Uint8Array {
    const totalLength = messages.reduce((sum, msg) => sum + msg.length, 0);
    const payload = new Uint8Array(totalLength);
    let offset = 0;
    for (const msg of messages) {
      payload.set(msg, offset);
      offset += msg.length;
    }
    return payload;
  }

  async executeExtendedQuery<T>(sql: string, params: any[]): Promise<{ rows: T[], affectedRows: number }> {
    if (!this.isConnected) await this.connect();

    const { name: statementName, fields } = await this.prepareAndDescribe(sql);
    const portalName = "";

    const messages = [
      this.protocol.encodeBind(portalName, statementName, params, [1]),
      this.protocol.encodeExecute(portalName, 0),
      this.protocol.encodeSync()
    ];

    await this.socket.write(this.concatMessages(messages));

    const rows: T[] = [];
    let affectedRows = 0;

    while (true) {
      const message = await this.readMessage();
      
      switch (message.type) {
        case "D": {
          if (fields.length <= 10) {
            rows.push(this.protocol.parseDataRow(message.data, fields) as unknown as T);
          } else {
            rows.push(createLazyRowProxy<T>(message.data, fields, this.protocol));
          }
          break;
        }
        case "C": {
          const tag = new TextDecoder().decode(message.data).replace(/\0$/, "");
          const parts = tag.split(" ");
          if (parts.length > 1) {
             const lastNum = parseInt(parts[parts.length - 1] ?? "0", 10);
             if (!isNaN(lastNum)) affectedRows = lastNum;
          }
          break;
        }
        case "A":
          this.handleNotification(message.data);
          break;
        case "E": {
          const errDetails = this.protocol.parseErrorResponse(message.data);
          await this.drainUntilReadyForQuery();
          throw new DBError(this.mapSqlStateToCode(errDetails.code ?? ""), errDetails.message ?? "Database error", errDetails);
        }
        case "Z":
          return { rows, affectedRows };
      }
    }
  }

  async executeBatch(queries: { sql: string; params: any[] }[]): Promise<{ rows: any[], affectedRows: number }[]> {
    if (!this.isConnected) await this.connect();
    if (queries.length === 0) return [];

    const results: { rows: any[], affectedRows: number }[] = [];
    const messages: Uint8Array[] = [];
    const queriesMeta: { name: string, fields: FieldDescription[] }[] = [];

    for (const q of queries) {
      const meta = await this.prepareAndDescribe(q.sql);
      queriesMeta.push(meta);
    }

    for (let i = 0; i < queries.length; i++) {
      const q = queries[i]!;
      const meta = queriesMeta[i]!;
      const portalName = `p_${i}`;
      messages.push(this.protocol.encodeBind(portalName, meta.name, q.params, [1]));
      messages.push(this.protocol.encodeExecute(portalName, 0));
    }
    messages.push(this.protocol.encodeSync());

    await this.socket.write(this.concatMessages(messages));

    let currentQueryIndex = 0;
    let currentRows: any[] = [];
    let currentAffectedRows = 0;

    while (true) {
      const message = await this.readMessage();
      
      switch (message.type) {
        case "D": {
          const fields = queriesMeta[currentQueryIndex]!.fields;
          if (fields.length <= 10) {
            currentRows.push(this.protocol.parseDataRow(message.data, fields));
          } else {
            currentRows.push(createLazyRowProxy<any>(message.data, fields, this.protocol));
          }
          break;
        }
        case "C": {
          const tag = new TextDecoder().decode(message.data).replace(/\0$/, "");
          const parts = tag.split(" ");
          if (parts.length > 1) {
             const lastNum = parseInt(parts[parts.length - 1] ?? "0", 10);
             if (!isNaN(lastNum)) currentAffectedRows = lastNum;
          }
          results.push({ rows: currentRows, affectedRows: currentAffectedRows });
          currentQueryIndex++;
          currentRows = [];
          currentAffectedRows = 0;
          break;
        }
        case "A":
          this.handleNotification(message.data);
          break;
        case "E": {
          const errDetails = this.protocol.parseErrorResponse(message.data);
          await this.drainUntilReadyForQuery();
          throw new DBError(this.mapSqlStateToCode(errDetails.code ?? ""), `Batch execution failed at query ${currentQueryIndex}: ${errDetails.message}`, errDetails);
        }
        case "Z":
          return results;
      }
    }
  }

  async *streamQuery<T>(sql: string, params: any[]): AsyncIterableIterator<T> {
    if (!this.isConnected) await this.connect();

    const { name: statementName, fields } = await this.prepareAndDescribe(sql);
    const portalName = "stream_portal";

    const messages = [
      this.protocol.encodeBind(portalName, statementName, params, [1]),
      this.protocol.encodeExecute(portalName, 0),
      this.protocol.encodeSync()
    ];

    await this.socket.write(this.concatMessages(messages));

    while (true) {
      const message = await this.readMessage();
      
      switch (message.type) {
        case "D":
          if (fields.length <= 10) {
            yield this.protocol.parseDataRow(message.data, fields) as unknown as T;
          } else {
            yield createLazyRowProxy<T>(message.data, fields, this.protocol);
          }
          break;
        case "C":
        case "A":
          if (message.type === "A") this.handleNotification(message.data);
          break;
        case "E": {
          const errDetails = this.protocol.parseErrorResponse(message.data);
          await this.drainUntilReadyForQuery();
          throw new DBError(this.mapSqlStateToCode(errDetails.code ?? ""), errDetails.message ?? "Database error", errDetails);
        }
        case "Z":
          return;
      }
    }
  }

  private mapSqlStateToCode(sqlState: string): DBErrorCode {
    if (sqlState.startsWith("23505")) return "UNIQUE_VIOLATION";
    if (sqlState.startsWith("23502")) return "NOT_NULL_VIOLATION";
    if (sqlState.startsWith("23503")) return "FOREIGN_KEY_VIOLATION";
    if (sqlState.startsWith("42")) return "SYNTAX_ERROR";
    if (sqlState.startsWith("08")) return "CONNECTION_FAILURE";
    return "UNKNOWN_ERROR";
  }

  private async drainUntilReadyForQuery(): Promise<void> {
    while (true) {
      const message = await this.readMessage();
      if (message.type === 'Z') break;
    }
  }

  private async readBytes(length: number): Promise<Uint8Array> {
    while (this.reader.length < length) {
      const iterator = this.socket.read();
      const { value, done } = await iterator.next();
      if (done || !value) throw new Error("Socket closed unexpectedly");
      this.reader.append(value);
    }
    return this.reader.consume(length);
  }

  private async readMessage(): Promise<PgMessage> {
    const typeBuf = await this.readBytes(1);
    const type = String.fromCharCode(typeBuf[0]!);
    const lengthBuf = await this.readBytes(4);
    const length = new DataView(lengthBuf.buffer, lengthBuf.byteOffset).getInt32(0);
    const data = await this.readBytes(length - 4);
    return { type, data };
  }

  async close(): Promise<void> {
    await this.socket.write(new Uint8Array(['X'.charCodeAt(0), 0, 0, 0, 4]));
    await this.socket.close();
    this.isConnected = false;
  }
}
