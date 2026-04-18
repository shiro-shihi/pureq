import { DBError } from "../errors/db-error.js";
import { MysqlProtocol, type MysqlField, type MysqlPacket } from "../protocol/mysql-wire.js";
import type { Driver, QueryResult } from "./types.js";

export interface MysqlTransport {
  send(data: Uint8Array): Promise<void>;
  receive(): AsyncIterableIterator<Uint8Array>;
  close(): Promise<void>;
}

export interface PureMysqlConfig {
  user: string;
  database?: string;
  password?: string;
}

export class PureMysqlDriver implements Driver {
  private protocol = new MysqlProtocol();
  private isConnected = false;
  private sequenceId = 0;

  constructor(
    private readonly transport: MysqlTransport,
    private readonly config: PureMysqlConfig
  ) {}

  private async sendPacket(payload: Uint8Array) {
    const packet = this.protocol.createPacket(payload, this.sequenceId++);
    await this.transport.send(packet);
  }

  private async receivePacket(): Promise<MysqlPacket> {
    for await (const chunk of this.transport.receive()) {
      const parsed = this.protocol.parsePacket(chunk);
      if (parsed) {
        this.sequenceId = parsed.packet.sequenceId + 1;
        return parsed.packet;
      }
    }
    throw new Error("Connection closed unexpectedly");
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;
    this.sequenceId = 0;

    const handshakePacket = await this.receivePacket();
    if (handshakePacket.payload[0] === 0xff) {
      this.throwError(handshakePacket.payload);
    }
    const handshake = this.protocol.parseInitialHandshake(handshakePacket.payload);

    const authResponse = await this.protocol.hashPasswordNative(this.config.password || "", handshake.salt);

    const responsePayload = this.protocol.encodeHandshakeResponse(
      this.config.user,
      this.config.database || "",
      authResponse
    );
    await this.sendPacket(responsePayload);

    const resultPacket = await this.receivePacket();
    if (resultPacket.payload[0] === 0xff) {
      this.throwError(resultPacket.payload);
    }

    this.isConnected = true;
  }

  async execute<T = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
    if (!this.isConnected) await this.connect();

    this.sequenceId = 0;
    await this.sendPacket(this.protocol.encodeStmtPrepare(sql));

    const prepareOkPacket = await this.receivePacket();
    if (prepareOkPacket.payload[0] === 0xff) this.throwError(prepareOkPacket.payload);

    const view = new DataView(prepareOkPacket.payload.buffer, prepareOkPacket.payload.byteOffset);
    const stmtId = view.getUint32(1, true);
    const numColumns = view.getUint16(5, true);
    const numParams = view.getUint16(7, true);

    if (numParams > 0) {
      for (let i = 0; i < numParams; i++) await this.receivePacket();
      await this.receivePacket();
    }
    if (numColumns > 0) {
      for (let i = 0; i < numColumns; i++) await this.receivePacket();
      await this.receivePacket();
    }

    this.sequenceId = 0;
    await this.sendPacket(this.protocol.encodeStmtExecute(stmtId, params));

    const executeResultPacket = await this.receivePacket();
    if (executeResultPacket.payload[0] === 0xff) this.throwError(executeResultPacket.payload);

    if (executeResultPacket.payload[0] === 0x00 && executeResultPacket.payload.length > 1) {
      const affectedRows = executeResultPacket.payload[1];
      const res: QueryResult<T> = { rows: [] };
      if (affectedRows !== undefined) res.affectedRows = affectedRows;
      return res;
    }

    const colCount = executeResultPacket.payload[0];
    if (colCount === undefined) throw new Error("Invalid response: column count missing");

    const fields: MysqlField[] = [];
    for (let i = 0; i < colCount; i++) {
      const fieldPacket = await this.receivePacket();
      fields.push(this.protocol.parseField(fieldPacket.payload));
    }
    await this.receivePacket();

    const rows: T[] = [];
    while (true) {
      const rowPacket = await this.receivePacket();
      if (rowPacket.payload[0] === 0xfe) break;
      if (rowPacket.payload[0] === 0xff) this.throwError(rowPacket.payload);
      
      const rowData = this.protocol.parseBinaryRow(rowPacket.payload, fields);
      const rowObj: Record<string, any> = {};
      for (let i = 0; i < fields.length; i++) {
        const field = fields[i];
        if (field) {
          rowObj[field.name] = rowData[i];
        }
      }
      rows.push(rowObj as unknown as T);
    }

    this.sequenceId = 0;
    const closePayload = new Uint8Array(5);
    closePayload[0] = 0x19;
    new DataView(closePayload.buffer).setUint32(1, stmtId, true);
    await this.sendPacket(closePayload);

    return { rows };
  }

  async transaction<T>(fn: (tx: Driver) => Promise<T>): Promise<T> {
    await this.executeText("BEGIN");
    try {
      const result = await fn(this);
      await this.executeText("COMMIT");
      return result;
    } catch (e) {
      await this.executeText("ROLLBACK");
      throw e;
    }
  }

  private async executeText(sql: string) {
    if (!this.isConnected) await this.connect();
    this.sequenceId = 0;
    const encoder = new TextEncoder();
    const sqlBytes = encoder.encode(sql);
    const payload = new Uint8Array(1 + sqlBytes.length);
    payload[0] = 0x03;
    payload.set(sqlBytes, 1);
    await this.sendPacket(payload);
    
    const response = await this.receivePacket();
    if (response.payload[0] === 0xff) this.throwError(response.payload);
  }

  private throwError(payload: Uint8Array): never {
    const error = this.protocol.parseError(payload);
    throw new DBError(this.mapSqlStateToCode(error.sqlState), error.message);
  }

  private mapSqlStateToCode(sqlState: string): any {
    if (sqlState.startsWith("23")) return "UNIQUE_VIOLATION";
    if (sqlState.startsWith("42")) return "SYNTAX_ERROR";
    if (sqlState.startsWith("08")) return "CONNECTION_FAILURE";
    return "UNKNOWN_ERROR";
  }
}
