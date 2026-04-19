import { MysqlProtocol, type MysqlPacket, type MysqlField, MYSQL_TYPES } from "../../../protocol/mysql-wire.js";
import { hashCachingSha2Password, encryptPasswordRsa } from "./auth.js";
import { BufferReader, type PureqSocket } from "../common/socket.js";
import { DBError } from "../../../errors/db-error.js";
import { createMysqlLazyRowProxy } from "./lazy-row.js";

export interface MysqlConnectionConfig {
  user: string;
  database: string;
  password?: string;
  ssl?: boolean | "require" | "prefer";
}

export class MysqlConnection {
  private protocol = new MysqlProtocol();
  private reader = new BufferReader();
  private isConnected = false;
  private sequenceId = 0;
  private statementCache = new Map<string, { id: number, fields: MysqlField[] }>();

  constructor(
    private readonly socket: PureqSocket,
    private readonly config: MysqlConnectionConfig
  ) {}

  async connect(): Promise<void> {
    if (this.isConnected) return;

    const handshakePacket = await this.readPacket();
    const handshake = this.protocol.parseInitialHandshake(handshakePacket.payload);

    if (this.config.ssl) {
      this.sequenceId = 1;
      const sslReq = this.protocol.encodeSSLRequest(this.config.database);
      await this.writePacket(sslReq);
      
      if (this.socket.upgradeTls) {
        await this.socket.upgradeTls({ host: "localhost" });
      } else {
        throw new Error("Socket implementation does not support TLS upgrade");
      }
    }

    let initialAuthResponse = new Uint8Array(0);
    if (this.config.password) {
        const hash = await this.protocol.hashPasswordNative(this.config.password, handshake.salt.slice(0, 20));
        initialAuthResponse = new Uint8Array(hash);
    }

    const responsePayload = this.protocol.encodeHandshakeResponse(
      this.config.user,
      this.config.database,
      initialAuthResponse,
      "mysql_native_password"
    );

    this.sequenceId = this.config.ssl ? 2 : 1;
    await this.writePacket(responsePayload);

    const authResult = await this.readPacket();
    
    if (authResult.payload[0] === 0xfe) {
        let offset = 1;
        let nullIdx = authResult.payload.indexOf(0, offset);
        const pluginName = new TextDecoder().decode(authResult.payload.slice(offset, nullIdx));
        offset = nullIdx + 1;
        const pluginData = authResult.payload.slice(offset, authResult.payload.length - 1);

        if (pluginName === "caching_sha2_password" && this.config.password) {
            const cachedHash = await hashCachingSha2Password(this.config.password, pluginData);
            this.sequenceId = authResult.sequenceId + 1;
            await this.writePacket(cachedHash);

            const nextResult = await this.readPacket();
            if (nextResult.payload[0] === 0x01 && nextResult.payload[1] === 0x04) {
               this.sequenceId = nextResult.sequenceId + 1;
               await this.writePacket(new Uint8Array([0x02]));
               const keyResponse = await this.readPacket();
               const pem = new TextDecoder().decode(keyResponse.payload.slice(1));
               const encryptedPass = await encryptPasswordRsa(this.config.password, pluginData, pem);
               this.sequenceId = keyResponse.sequenceId + 1;
               await this.writePacket(encryptedPass);
               const finalResult = await this.readPacket();
               this.handleAuthResponse(finalResult.payload);
            } else {
               this.handleAuthResponse(nextResult.payload);
            }
        } else {
            throw new Error(`Unsupported authentication plugin: ${pluginName}`);
        }
    } else {
        this.handleAuthResponse(authResult.payload);
    }
  }

  private handleAuthResponse(payload: Uint8Array) {
    if (payload[0] === 0x00) {
      this.isConnected = true;
    } else if (payload[0] === 0xff) {
      const err = this.protocol.parseError(payload);
      throw new DBError("CONNECTION_FAILURE", `Authentication failed: ${err.message}`, err);
    } else {
      throw new Error(`Unexpected auth response: ${payload[0]}`);
    }
  }

  private static readonly MAX_STATEMENTS = 1000;

  private async prepareStatement(sql: string): Promise<{ id: number, fields: MysqlField[] }> {
    const cached = this.statementCache.get(sql);
    if (cached) return cached;

    this.sequenceId = 0;
    const preparePayload = this.protocol.encodeStmtPrepare(sql);
    await this.writePacket(preparePayload);

    const prepareOk = await this.readPacket();
    if (prepareOk.payload[0] === 0xff) {
      const err = this.protocol.parseError(prepareOk.payload);
      throw new DBError("SYNTAX_ERROR", `Prepare failed: ${err.message}`, err);
    }
    
    if (prepareOk.payload[0] !== 0x00) throw new Error("Expected PREPARE_OK");

    const view = new DataView(prepareOk.payload.buffer, prepareOk.payload.byteOffset);
    const stmtId = view.getUint32(1, true);
    const numColumns = view.getUint16(5, true);
    const numParams = view.getUint16(7, true);

    if (numParams > 0) {
      for (let i = 0; i < numParams; i++) await this.readPacket();
      await this.readPacket();
    }

    const fields: MysqlField[] = [];
    if (numColumns > 0) {
      for (let i = 0; i < numColumns; i++) {
        const fieldPkt = await this.readPacket();
        fields.push(this.protocol.parseField(fieldPkt.payload));
      }
      await this.readPacket();
    }

    const result = { id: stmtId, fields };
    
    if (this.statementCache.size >= MysqlConnection.MAX_STATEMENTS) {
        const oldestKey = this.statementCache.keys().next().value;
        if (oldestKey !== undefined) {
            this.statementCache.delete(oldestKey);
        }
    }
    
    this.statementCache.set(sql, result);
    return result;
  }

  async executeExtendedQuery<T>(sql: string, params: any[]): Promise<{ rows: T[], affectedRows: number, insertId?: number | undefined }> {
    if (!this.isConnected) await this.connect();

    const { id: stmtId, fields } = await this.prepareStatement(sql);

    this.sequenceId = 0;
    const execPayload = this.protocol.encodeStmtExecute(stmtId, params);
    await this.writePacket(execPayload);

    const rows: T[] = [];
    let affectedRows = 0;
    let insertId: number | undefined = undefined;

    if (fields.length === 0) {
       const execOk = await this.readPacket();
       if (execOk.payload[0] === 0xff) {
         const err = this.protocol.parseError(execOk.payload);
         throw new DBError("UNKNOWN_ERROR", `Execute failed: ${err.message}`, err);
       }
       if (execOk.payload[0] === 0x00) {
         const okView = new DataView(execOk.payload.buffer, execOk.payload.byteOffset);
         affectedRows = okView.getUint8(1); 
         insertId = okView.getUint8(2); 
       }
    } else {
       while (true) {
         const pkt = await this.readPacket();
         if (pkt.payload[0] === 0xfe && pkt.payload.length < 9) break;
         if (pkt.payload[0] === 0xff) {
             const err = this.protocol.parseError(pkt.payload);
             throw new DBError("UNKNOWN_ERROR", `Row read failed: ${err.message}`, err);
         }
         if (pkt.payload[0] === 0x00) {
             if (fields.length <= 10) {
                 rows.push(this.eagerParseMysqlRow(pkt.payload, fields) as unknown as T);
             } else {
                 rows.push(createMysqlLazyRowProxy<T>(pkt.payload, fields, this.protocol));
             }
         }
       }
    }

    const res: { rows: T[], affectedRows: number, insertId?: number | undefined } = { rows, affectedRows };
    if (insertId !== undefined) res.insertId = insertId;
    return res;
  }

  private eagerParseMysqlRow(rawData: Uint8Array, fields: MysqlField[]): Record<string, any> {
    const view = new DataView(rawData.buffer, rawData.byteOffset, rawData.length);
    const nullBitmapLength = Math.floor((fields.length + 7 + 2) / 8);
    let current = 1 + nullBitmapLength;
    const row: Record<string, any> = {};

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i]!;
      const idx = Math.floor((i + 2) / 8);
      if (1 + idx >= rawData.length) throw new Error("Row data truncated (null bitmap)");
      const isNull = (rawData[1 + idx]! & (1 << ((i + 2) % 8))) !== 0;
      if (isNull) {
        row[field.name] = null;
        continue;
      }
      
      const type = field.type;
      // Fast-path for fixed-length types
      if (type === MYSQL_TYPES.LONG) {
        if (current + 4 > rawData.length) throw new Error("Row data truncated (LONG)");
        row[field.name] = view.getInt32(current, true); current += 4;
      } else if (type === MYSQL_TYPES.VAR_STRING || type === MYSQL_TYPES.STRING || type === MYSQL_TYPES.VARCHAR) {
        const { value: len, length: lenBytes } = (this.protocol as any).readLenEnc(rawData, current);
        const l = Number(len);
        if (current + lenBytes + l > rawData.length) throw new Error("Row data truncated (string)");
        row[field.name] = this.protocol.decodeString(rawData, current + lenBytes, l);
        current += lenBytes + l;
      } else if (type === MYSQL_TYPES.TINY) {
        if (current + 1 > rawData.length) throw new Error("Row data truncated (TINY)");
        row[field.name] = view.getInt8(current); current += 1;
      } else {
        // Fallback for other types
        switch (type) {
          case MYSQL_TYPES.SHORT:
          case MYSQL_TYPES.YEAR: 
            if (current + 2 > rawData.length) throw new Error("Row data truncated (SHORT/YEAR)");
            row[field.name] = view.getInt16(current, true); current += 2; break;
          case MYSQL_TYPES.INT24:
            if (current + 4 > rawData.length) throw new Error("Row data truncated (INT24)");
            row[field.name] = view.getInt32(current, true); current += 4; break;
          case MYSQL_TYPES.LONGLONG: 
            if (current + 8 > rawData.length) throw new Error("Row data truncated (LONGLONG)");
            row[field.name] = Number(view.getBigInt64(current, true)); current += 8; break;
          case MYSQL_TYPES.FLOAT: 
            if (current + 4 > rawData.length) throw new Error("Row data truncated (FLOAT)");
            row[field.name] = view.getFloat32(current, true); current += 4; break;
          case MYSQL_TYPES.DOUBLE: 
            if (current + 8 > rawData.length) throw new Error("Row data truncated (DOUBLE)");
            row[field.name] = view.getFloat64(current, true); current += 8; break;
          default: {
            const { value: len, length: lenBytes } = (this.protocol as any).readLenEnc(rawData, current);
            if (current + lenBytes + Number(len) > rawData.length) throw new Error("Row data truncated (fallback)");
            const str = this.protocol.decodeString(rawData, current + lenBytes, Number(len));
            row[field.name] = type === MYSQL_TYPES.JSON ? JSON.parse(str) : str;
            current += lenBytes + Number(len);
            break;
          }
        }
      }
    }
    return row;
  }

  async executeBatch(queries: { sql: string; params: any[] }[]): Promise<{ rows: any[], affectedRows: number, insertId?: number }[]> {
    if (!this.isConnected) await this.connect();
    if (queries.length === 0) return [];
    const metaList = [];
    for (const q of queries) metaList.push(await this.prepareStatement(q.sql));
    const payloads = [];
    for (let i = 0; i < queries.length; i++) payloads.push(this.protocol.createPacket(this.protocol.encodeStmtExecute(metaList[i]!.id, queries[i]!.params), 0));
    const combined = new Uint8Array(payloads.reduce((s, p) => s + p.length, 0));
    let offset = 0;
    for (const p of payloads) { combined.set(p, offset); offset += p.length; }
    await this.socket.write(combined);
    const finalResults: { rows: any[], affectedRows: number, insertId?: number }[] = [];
    for (let i = 0; i < queries.length; i++) {
      const { fields } = metaList[i]!;
      const rows: any[] = [];
      let affectedRows = 0;
      let insertId: number | undefined = undefined;
      if (fields.length === 0) {
        const execOk = await this.readPacket();
        if (execOk.payload[0] === 0x00) {
          const okView = new DataView(execOk.payload.buffer, execOk.payload.byteOffset);
          affectedRows = okView.getUint8(1);
          insertId = okView.getUint8(2);
        }
      } else {
        while (true) {
          const pkt = await this.readPacket();
          if (pkt.payload[0] === 0xfe && pkt.payload.length < 9) break;
          if (pkt.payload[0] === 0x00) {
            if (fields.length <= 10) rows.push(this.eagerParseMysqlRow(pkt.payload, fields));
            else rows.push(createMysqlLazyRowProxy<any>(pkt.payload, fields, this.protocol));
          }
        }
      }
      const res: { rows: any[], affectedRows: number, insertId?: number } = { rows, affectedRows };
      if (insertId !== undefined) res.insertId = insertId;
      finalResults.push(res);
    }
    return finalResults;
  }

  async *streamQuery<T>(sql: string, params: any[]): AsyncIterableIterator<T> {
    if (!this.isConnected) await this.connect();
    const { id: stmtId, fields } = await this.prepareStatement(sql);
    this.sequenceId = 0;
    await this.writePacket(this.protocol.encodeStmtExecute(stmtId, params));
    if (fields.length === 0) {
        const execOk = await this.readPacket();
        if (execOk.payload[0] === 0xff) throw new DBError("UNKNOWN_ERROR", "Stream failed");
        return;
    }
    while (true) {
      const pkt = await this.readPacket();
      if (pkt.payload[0] === 0xfe && pkt.payload.length < 9) break;
      if (pkt.payload[0] === 0x00) {
          if (fields.length <= 10) yield this.eagerParseMysqlRow(pkt.payload, fields) as unknown as T;
          else yield createMysqlLazyRowProxy<T>(pkt.payload, fields, this.protocol);
      }
    }
  }

  private async writePacket(payload: Uint8Array): Promise<void> {
    await this.socket.write(this.protocol.createPacket(payload, this.sequenceId++));
  }

  private static readonly MAX_PACKET_SIZE = 16 * 1024 * 1024; // 16MB

  private async readPacket(): Promise<MysqlPacket> {
    while (true) {
      if (this.reader.length >= 4) {
        const header = this.reader.peek(4)!;
        const length = (header[0]! | (header[1]! << 8) | (header[2]! << 16));
        
        if (length > MysqlConnection.MAX_PACKET_SIZE) {
            throw new Error(`MySQL packet too large: ${length} bytes. Max allowed: ${MysqlConnection.MAX_PACKET_SIZE}`);
        }
        
        if (this.reader.length >= length + 4) {
          const fullPacket = this.reader.consume(length + 4);
          const parsed = this.protocol.parsePacket(fullPacket);
          if (parsed) { this.sequenceId = parsed.packet.sequenceId + 1; return parsed.packet; }
        }
      }
      const iterator = this.socket.read();
      const { value, done } = await iterator.next();
      if (done || !value) throw new Error("MySQL socket closed unexpectedly");
      this.reader.append(value);
    }
  }

  async close(): Promise<void> {
    this.sequenceId = 0;
    await this.writePacket(new Uint8Array([0x01]));
    await this.socket.close();
    this.isConnected = false;
  }
}
