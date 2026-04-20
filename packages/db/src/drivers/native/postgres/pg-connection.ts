import { PgProtocol, type FieldDescription, type PgMessage, type PgNotification } from "../../../protocol/pg-wire.js";
import { PureqConnection } from "@pureq/connectivity";
import { DBError, type DBErrorCode } from "../../../errors/db-error.js";
import { ScramSha256 } from "./scram.js";

export interface PgConnectionConfig {
  user: string;
  password?: string;
  database: string;
}

export type PgNotificationListener = (n: PgNotification) => void;

export class PgConnection {
  private protocol = new PgProtocol();
  private isConnected = false;
  private parameters: Record<string, string> = {};
  private backendKeyData?: { processId: number, secretKey: number };
  private notificationListeners: Set<PgNotificationListener> = new Set();
  private preparedStatements = new Map<string, { name: string, fields: FieldDescription[] }>();
  private stmtCounter = 0;

  constructor(private connection: PureqConnection, private config: PgConnectionConfig) {}

  async connect(): Promise<void> {
    if (this.isConnected) return;
    await this.connection.writer.write(this.protocol.encodeStartupMessage(this.config.user, this.config.database));
    while (true) {
      const msg = await this.readMessage();
      switch (msg.type) {
        case "R": await this.handleAuth(msg.data); break;
        case "S": this.handleParameterStatus(msg.data); break;
        case "K": this.handleBackendKeyData(msg.data); break;
        case "Z": this.isConnected = true; return;
        case "E": throw new DBError("CONNECTION_FAILURE", this.protocol.parseErrorResponse(msg.data).message);
      }
    }
  }

  private async handleAuth(data: Uint8Array) {
    const type = new DataView(data.buffer, data.byteOffset).getInt32(0);
    if (type === 0) return;
    if (type === 10) return this.handleSaslAuth(data);
    throw new Error(`Unsupported Auth: ${type}`);
  }

  private async handleSaslAuth(data: Uint8Array) {
    if (!this.config.password) throw new Error("Missing password for SASL");
    const scram = new ScramSha256(this.config.user, this.config.password);
    await this.connection.writer.write(this.protocol.encodeSaslInitialResponse("SCRAM-SHA-256", scram.clientFirstMessage()));
    const serverFirst = await this.readMessage();
    const serverFinal = await scram.clientFinalMessage(new TextDecoder().decode(serverFirst.data.subarray(4)));
    await this.connection.writer.write(this.protocol.encodePasswordMessage(serverFinal));
    const final = await this.readMessage();
    // Server Signature Verification (Restored)
    if (!(await scram.verifyServerSignature(new TextDecoder().decode(final.data.subarray(4))))) {
        throw new Error("MITM Detected: Server signature mismatch");
    }
  }

  private async readMessage(): Promise<PgMessage> {
    const typeBuf = await this.connection.reader.read(1);
    const lengthBuf = await this.connection.reader.read(4);
    const length = (lengthBuf[0]! << 24) | (lengthBuf[1]! << 16) | (lengthBuf[2]! << 8) | lengthBuf[3]!;
    const data = await this.connection.reader.read(length - 4);
    return { type: String.fromCharCode(typeBuf[0]!), data };
  }

  async executeExtendedQuery<T>(sql: string, params: any[]): Promise<{ rows: T[], affectedRows: number }> {
    if (!this.isConnected) await this.connect();
    const stmtName = `ps_${this.stmtCounter++}`;
    
    // Parse, Bind, Describe, Execute, Sync
    await this.connection.writer.write(this.protocol.encodeParse(stmtName, sql));
    await this.connection.writer.write(this.protocol.encodeBind("", stmtName, params, [1]));
    await this.connection.writer.write(this.protocol.encodeDescribe("P", ""));
    await this.connection.writer.write(this.protocol.encodeExecute("", 0));
    await this.connection.writer.write(this.protocol.encodeSync());

    const rows: T[] = [];
    let fields: FieldDescription[] = [];
    let affectedRows = 0;

    while (true) {
      const msg = await this.readMessage();
      if (msg.type === "T") fields = this.protocol.parseRowDescription(msg.data);
      if (msg.type === "D") rows.push(this.protocol.parseDataRow(msg.data, fields) as T);
      if (msg.type === "C") {
          const tag = new TextDecoder().decode(msg.data);
          const num = parseInt(tag.split(" ").pop() || "0");
          if (!isNaN(num)) affectedRows = num;
      }
      if (msg.type === "Z") break;
      if (msg.type === "E") throw new DBError("SYNTAX_ERROR", this.protocol.parseErrorResponse(msg.data).message);
    }
    return { rows, affectedRows };
  }

  async *streamQuery<T>(sql: string, params: any[]): AsyncIterableIterator<T> {
    if (!this.isConnected) await this.connect();
    const stmtName = `ps_stream_${this.stmtCounter++}`;
    
    await this.connection.writer.write(this.protocol.encodeParse(stmtName, sql));
    await this.connection.writer.write(this.protocol.encodeBind("", stmtName, params, [1]));
    await this.connection.writer.write(this.protocol.encodeDescribe("P", ""));
    await this.connection.writer.write(this.protocol.encodeExecute("", 0));
    await this.connection.writer.write(this.protocol.encodeSync());

    let fields: FieldDescription[] = [];

    while (true) {
      const msg = await this.readMessage();
      if (msg.type === "T") fields = this.protocol.parseRowDescription(msg.data);
      if (msg.type === "D") yield this.protocol.parseDataRow(msg.data, fields) as T;
      if (msg.type === "Z") break;
      if (msg.type === "E") throw new DBError("SYNTAX_ERROR", this.protocol.parseErrorResponse(msg.data).message);
    }
  }

  onNotification(listener: PgNotificationListener): () => void {
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  private handleParameterStatus(data: Uint8Array) {}
  private handleBackendKeyData(data: Uint8Array) {}

  async close(): Promise<void> {
    await this.connection.writer.write(new Uint8Array(['X'.charCodeAt(0), 0, 0, 0, 4]));
    await this.connection.writer.close();
  }
}
