import { MysqlProtocol, type MysqlPacket, type MysqlField, MYSQL_TYPES } from "../../../protocol/mysql-wire.js";
import { hashCachingSha2Password, encryptPasswordRsa } from "./auth.js";
import { PureqConnection } from "@pureq/connectivity";
import { DBError } from "../../../errors/db-error.js";

export interface MysqlConnectionConfig {
  user: string;
  password?: string;
  database: string;
}

/**
 * Universal MySQL Connection (Full Implementation)
 */
export class MysqlConnection {
  private protocol = new MysqlProtocol();
  private isConnected = false;
  private sequenceId = 0;
  private statementCache = new Map<string, { id: number, fields: MysqlField[] }>();

  constructor(private connection: PureqConnection, private config: MysqlConnectionConfig) {}

  async connect(): Promise<void> {
    if (this.isConnected) return;

    // 1. Read Handshake
    const handshake = await this.readPacket();
    const serverInfo = this.protocol.parseInitialHandshake(handshake.payload);

    // 2. Auth Response
    const authResponse = await this.protocol.hashPasswordNative(this.config.password || "", serverInfo.salt);
    const handshakeResponse = this.protocol.encodeHandshakeResponse(
      this.config.user,
      this.config.database,
      authResponse
    );

    this.sequenceId = handshake.sequenceId + 1;
    await this.writePacket(handshakeResponse);

    const authResult = await this.readPacket();
    if (authResult.payload[0] === 0xff) {
        throw new Error(`MySQL Auth Failed: ${this.protocol.parseError(authResult.payload).message}`);
    }

    this.isConnected = true;
  }

  private async writePacket(payload: Uint8Array) {
    const packet = this.protocol.createPacket(payload, this.sequenceId++);
    await this.connection.writer.write(packet);
  }

  private async readPacket(): Promise<MysqlPacket> {
    const header = await this.connection.reader.read(4);
    const length = header[0]! | (header[1]! << 8) | (header[2]! << 16);
    const sequenceId = header[3]!;
    const payload = await this.connection.reader.read(length);
    return { sequenceId, payload };
  }

  async executeExtendedQuery<T>(sql: string, params: any[]): Promise<{ rows: T[], affectedRows: number, insertId?: number }> {
    if (!this.isConnected) await this.connect();

    // Binary Protocol (Prepared Statements)
    const { id: stmtId, fields } = await this.prepareStatement(sql);
    
    this.sequenceId = 0;
    await this.writePacket(this.protocol.encodeStmtExecute(stmtId, params));

    const rows: T[] = [];
    let affectedRows = 0;

    if (fields.length === 0) {
      const ok = await this.readPacket();
      if (ok.payload[0] === 0x00) {
          const view = new DataView(ok.payload.buffer, ok.payload.byteOffset);
          affectedRows = view.getUint8(1);
      }
    } else {
      while (true) {
        const pkt = await this.readPacket();
        if (pkt.payload[0] === 0xfe && pkt.payload.length < 9) break; // EOF
        if (pkt.payload[0] === 0xff) throw new Error(this.protocol.parseError(pkt.payload).message);
        
        // Decoding logic (Bitwise)
        rows.push(this.protocol.parseBinaryRow(pkt.payload, fields) as unknown as T);
      }
    }

    return { rows, affectedRows };
  }

  private async prepareStatement(sql: string): Promise<{ id: number, fields: MysqlField[] }> {
    const cached = this.statementCache.get(sql);
    if (cached) return cached;

    this.sequenceId = 0;
    await this.writePacket(this.protocol.encodeStmtPrepare(sql));
    const res = await this.readPacket();
    if (res.payload[0] === 0xff) throw new Error(this.protocol.parseError(res.payload).message);

    const view = new DataView(res.payload.buffer, res.payload.byteOffset);
    const stmtId = view.getUint32(1, true);
    const numColumns = view.getUint16(5, true);

    const fields: MysqlField[] = [];
    if (numColumns > 0) {
        for (let i = 0; i < numColumns; i++) {
            const f = await this.readPacket();
            fields.push(this.protocol.parseField(f.payload));
        }
        await this.readPacket(); // EOF
    }

    const result = { id: stmtId, fields };
    this.statementCache.set(sql, result);
    return result;
  }

  async *streamQuery<T>(sql: string, params: any[]): AsyncIterableIterator<T> {
    if (!this.isConnected) await this.connect();

    const { id: stmtId, fields } = await this.prepareStatement(sql);
    
    this.sequenceId = 0;
    await this.writePacket(this.protocol.encodeStmtExecute(stmtId, params));

    if (fields.length > 0) {
      while (true) {
        const pkt = await this.readPacket();
        if (pkt.payload[0] === 0xfe && pkt.payload.length < 9) break; // EOF
        if (pkt.payload[0] === 0xff) throw new Error(this.protocol.parseError(pkt.payload).message);
        
        yield this.protocol.parseBinaryRow(pkt.payload, fields) as unknown as T;
      }
    }
  }

  async close(): Promise<void> {
    await this.connection.writer.close();
  }
}
