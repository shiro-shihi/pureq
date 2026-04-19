/**
 * Pure TypeScript MySQL Wire Protocol implementation.
 * Zero Node.js dependencies. Uses Uint8Array, DataView, and standard Web Crypto API.
 */

export interface MysqlPacket {
  sequenceId: number;
  payload: Uint8Array;
}

export interface MysqlError {
  code: number;
  sqlState: string;
  message: string;
}

export interface MysqlField {
  catalog: string;
  schema: string;
  table: string;
  orgTable: string;
  name: string;
  orgName: string;
  characterSet: number;
  columnLength: number;
  type: number;
  flags: number;
  decimals: number;
}

// MySQL Capability Flags
export const CLIENT_PROTOCOL_41 = 0x00000200;
export const CLIENT_PLUGIN_AUTH = 0x00080000;
export const CLIENT_SECURE_CONNECTION = 0x00008000;
export const CLIENT_PLUGIN_AUTH_LENENC_CLIENT_DATA = 0x00200000;
export const CLIENT_CONNECT_WITH_DB = 0x00000008;

export const MYSQL_TYPES = {
  DECIMAL: 0x00, TINY: 0x01, SHORT: 0x02, LONG: 0x03, FLOAT: 0x04,
  DOUBLE: 0x05, NULL: 0x06, TIMESTAMP: 0x07, LONGLONG: 0x08, INT24: 0x09,
  DATE: 0x0a, TIME: 0x0b, DATETIME: 0x0c, YEAR: 0x0d, NEWDATE: 0x0e,
  VARCHAR: 0x0f, BIT: 0x10, JSON: 0xf5, NEWDECIMAL: 0xf6, ENUM: 0xf7, SET: 0xf8,
  TINY_BLOB: 0xf9, MEDIUM_BLOB: 0xfa, LONG_BLOB: 0xfb, BLOB: 0xfc,
  VAR_STRING: 0xfd, STRING: 0xfe, GEOMETRY: 0xff
} as const;

export class MysqlProtocol {
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();

  /**
   * Ultra-fast ASCII decoder for small strings.
   * Avoids the C++/JS boundary crossing overhead of TextDecoder.
   */
  decodeString(buf: Uint8Array, start: number, length: number): string {
    if (length < 64) {
      let isAscii = true;
      let str = "";
      for (let i = start; i < start + length; i++) {
        const b = buf[i]!;
        if (b > 127) { isAscii = false; break; }
        str += String.fromCharCode(b);
      }
      if (isAscii) return str;
    }
    return this.decoder.decode(buf.subarray(start, start + length));
  }

  // --- Packet Framing ---
  
  private readInt16LE(buf: Uint8Array, offset: number): number {
    return buf[offset]! | (buf[offset + 1]! << 8);
  }

  private readInt32LE(buf: Uint8Array, offset: number): number {
    return (buf[offset]! | (buf[offset + 1]! << 8) | (buf[offset + 2]! << 16) | (buf[offset + 3]! << 24)) >>> 0;
  }

  private readInt64LE(buf: Uint8Array, offset: number): bigint {
    const lo = this.readInt32LE(buf, offset);
    const hi = this.readInt32LE(buf, offset + 4);
    return (BigInt(hi) << 32n) | BigInt(lo);
  }

  createPacket(payload: Uint8Array, sequenceId: number): Uint8Array {
    const buffer = new Uint8Array(payload.length + 4);
    buffer[0] = payload.length & 0xff;
    buffer[1] = (payload.length >> 8) & 0xff;
    buffer[2] = (payload.length >> 16) & 0xff;
    buffer[3] = sequenceId;
    buffer.set(payload, 4);
    return buffer;
  }

  parsePacket(data: Uint8Array): { packet: MysqlPacket, consumed: number } | null {
    if (data.length < 4) return null;
    const length = (data[0] || 0) | ((data[1] || 0) << 8) | ((data[2] || 0) << 16);
    if (data.length < length + 4) return null;
    return {
      packet: { sequenceId: data[3] || 0, payload: data.slice(4, 4 + length) },
      consumed: length + 4
    };
  }

  // --- Authentication ---

  parseInitialHandshake(payload: Uint8Array) {
    let offset = 0;
    const protocolVersion = payload[offset++];
    if (protocolVersion === undefined) throw new Error("Invalid protocol version");
    
    const nullIdx = payload.indexOf(0, offset);
    if (nullIdx === -1) throw new Error("Invalid server version in handshake");
    const serverVersion = this.decoder.decode(payload.slice(offset, nullIdx));
    offset = nullIdx + 1;
    
    if (offset + 4 > payload.length) throw new Error("Handshake truncated (connectionId)");
    const view = new DataView(payload.buffer, payload.byteOffset, payload.length);
    const connectionId = view.getUint32(offset, true);
    offset += 4;
    
    if (offset + 8 > payload.length) throw new Error("Handshake truncated (authPluginData1)");
    const authPluginData1 = payload.slice(offset, offset + 8);
    offset += 8;
    offset += 1; // filter (0x00)

    if (offset + 2 > payload.length) throw new Error("Handshake truncated (capabilityFlags1)");
    const capabilityFlags1 = (payload[offset] || 0) | ((payload[offset + 1] || 0) << 8);
    offset += 2;
    if (offset >= payload.length) throw new Error("Handshake truncated (characterSet)");
    const characterSet = payload[offset++];
    if (characterSet === undefined) throw new Error("Invalid character set");
    if (offset + 2 > payload.length) throw new Error("Handshake truncated (statusFlags)");
    const statusFlags = (payload[offset] || 0) | ((payload[offset + 1] || 0) << 8);
    offset += 2;
    if (offset + 2 > payload.length) throw new Error("Handshake truncated (capabilityFlags2)");
    const capabilityFlags2 = (payload[offset] || 0) | ((payload[offset + 1] || 0) << 8);
    offset += 2;
    
    if (offset >= payload.length) throw new Error("Handshake truncated (authPluginDataLen)");
    const authPluginDataLen = payload[offset++];
    if (authPluginDataLen === undefined) throw new Error("Invalid auth plugin data length");
    offset += 10; // reserved
    
    const secondPartLen = Math.max(13, authPluginDataLen - 8) - 1;
    if (offset + secondPartLen > payload.length) throw new Error("Handshake truncated (authPluginData2)");
    const authPluginData2 = payload.slice(offset, offset + secondPartLen);
    
    const salt = new Uint8Array(authPluginData1.length + authPluginData2.length);
    salt.set(authPluginData1);
    salt.set(authPluginData2, authPluginData1.length);

    return { serverVersion, connectionId, salt, characterSet };
  }

  async hashPasswordNative(password: string, salt: Uint8Array): Promise<Uint8Array> {
    if (!password) return new Uint8Array(0);
    const passBytes = this.encoder.encode(password);
    
    const hash1Buf = await crypto.subtle.digest("SHA-1", passBytes);
    const hash1 = new Uint8Array(hash1Buf);
    
    const hash2Buf = await crypto.subtle.digest("SHA-1", hash1Buf);
    const hash2 = new Uint8Array(hash2Buf);
    
    const concat = new Uint8Array(salt.length + hash2.length);
    concat.set(salt, 0);
    concat.set(hash2, salt.length);
    
    const hash3Buf = await crypto.subtle.digest("SHA-1", concat);
    const hash3 = new Uint8Array(hash3Buf);
    
    const result = new Uint8Array(20);
    for (let i = 0; i < 20; i++) {
      const h1 = hash1[i];
      const h3 = hash3[i];
      if (h1 !== undefined && h3 !== undefined) {
        result[i] = h1 ^ h3;
      }
    }
    return result;
  }

  encodeHandshakeResponse(user: string, database: string, authResponse: Uint8Array, pluginName: string = "mysql_native_password"): Uint8Array {
    let clientFlags = CLIENT_PROTOCOL_41 | CLIENT_PLUGIN_AUTH | CLIENT_SECURE_CONNECTION | CLIENT_PLUGIN_AUTH_LENENC_CLIENT_DATA;
    if (database) clientFlags |= CLIENT_CONNECT_WITH_DB;

    const userBytes = this.encoder.encode(user);
    const dbBytes = database ? this.encoder.encode(database) : new Uint8Array(0);
    const pluginBytes = this.encoder.encode(pluginName);

    let size = 4 + 4 + 1 + 23 + userBytes.length + 1;
    size += this.lenEncLength(authResponse.length) + authResponse.length;
    if (database) size += dbBytes.length + 1;
    size += pluginBytes.length + 1;

    const payload = new Uint8Array(size);
    const view = new DataView(payload.buffer);
    
    view.setUint32(0, clientFlags, true);
    view.setUint32(4, 0xffffff, true);
    payload[8] = 33;
    let offset = 32;

    payload.set(userBytes, offset); offset += userBytes.length;
    payload[offset++] = 0;

    offset = this.writeLenEnc(payload, offset, authResponse.length);
    payload.set(authResponse, offset); offset += authResponse.length;

    if (database) {
      payload.set(dbBytes, offset); offset += dbBytes.length;
      payload[offset++] = 0;
    }

    payload.set(pluginBytes, offset); offset += pluginBytes.length;
    payload[offset++] = 0;

    return payload;
  }

  encodeSSLRequest(database?: string): Uint8Array {
    let clientFlags = CLIENT_PROTOCOL_41 | CLIENT_PLUGIN_AUTH | CLIENT_SECURE_CONNECTION | CLIENT_PLUGIN_AUTH_LENENC_CLIENT_DATA;
    if (database) clientFlags |= CLIENT_CONNECT_WITH_DB;

    const payload = new Uint8Array(32);
    const view = new DataView(payload.buffer);
    
    view.setUint32(0, clientFlags, true);
    view.setUint32(4, 0xffffff, true);
    payload[8] = 33;
    
    return payload;
  }

  encodeStmtPrepare(sql: string): Uint8Array {
    const sqlBytes = this.encoder.encode(sql);
    const payload = new Uint8Array(1 + sqlBytes.length);
    payload[0] = 0x16;
    payload.set(sqlBytes, 1);
    return payload;
  }

  encodeStmtExecute(stmtId: number, params: any[]): Uint8Array {
    const nullBitmapLength = Math.floor((params.length + 7) / 8);
    const nullBitmap = new Uint8Array(nullBitmapLength);
    
    const typesSize = params.length * 2;
    let valuesSize = 0;
    
    const encodedParams: (Uint8Array | undefined)[] = [];
    for (let i = 0; i < params.length; i++) {
      const p = params[i];
      if (p === null || p === undefined) {
        const idx = Math.floor(i / 8);
        const current = nullBitmap[idx];
        if (current !== undefined) {
          nullBitmap[idx] = current | (1 << (i % 8));
        }
        encodedParams.push(undefined);
      } else {
        const bytes = this.encoder.encode(String(p));
        encodedParams.push(bytes);
        valuesSize += this.lenEncLength(bytes.length) + bytes.length;
      }
    }

    const payloadLength = 1 + 4 + 1 + 4 + nullBitmapLength + 1 + typesSize + valuesSize;
    const payload = new Uint8Array(payloadLength);
    const view = new DataView(payload.buffer);
    
    payload[0] = 0x17;
    view.setUint32(1, stmtId, true);
    payload[5] = 0x00;
    view.setUint32(6, 1, true);
    
    let offset = 10;
    payload.set(nullBitmap, offset); offset += nullBitmapLength;
    
    payload[offset++] = 1;
    
    for (let i = 0; i < params.length; i++) {
      payload[offset++] = MYSQL_TYPES.STRING;
      payload[offset++] = 0;
    }

    for (let i = 0; i < params.length; i++) {
      const bytes = encodedParams[i];
      const idx = Math.floor(i / 8);
      const currentByte = nullBitmap[idx];
      if (bytes !== undefined && currentByte !== undefined && (currentByte & (1 << (i % 8))) === 0) {
        offset = this.writeLenEnc(payload, offset, bytes.length);
        payload.set(bytes, offset); offset += bytes.length;
      }
    }

    return payload;
  }

  parseError(payload: Uint8Array): MysqlError {
    if (payload.length < 3) throw new Error("Error packet too short");
    const view = new DataView(payload.buffer, payload.byteOffset, payload.length);
    const code = view.getUint16(1, true);
    let sqlState = "HY000";
    let message = "";
    if (payload[3] === '#'.charCodeAt(0)) {
      if (payload.length < 9) throw new Error("Error packet too short for SQL state");
      sqlState = this.decoder.decode(payload.slice(4, 9));
      message = this.decoder.decode(payload.slice(9));
    } else {
      message = this.decoder.decode(payload.slice(3));
    }
    return { code, sqlState, message };
  }

  parseField(payload: Uint8Array): MysqlField {
    let offset = 0;
    const readString = () => {
      const { value, length } = this.readLenEnc(payload, offset);
      offset += length;
      const len = Number(value);
      if (offset + len > payload.length) throw new Error("Field packet truncated (string)");
      const strBytes = payload.slice(offset, offset + len);
      offset += len;
      return this.decodeString(payload, offset, len);
    };

    const catalog = readString();
    const schema = readString();
    const table = readString();
    const orgTable = readString();
    const name = readString();
    const orgName = readString();
    
    if (offset + 1 > payload.length) throw new Error("Field packet truncated (filler)");
    offset += 1;
    if (offset + 12 > payload.length) throw new Error("Field packet truncated (metadata)");
    const view = new DataView(payload.buffer, payload.byteOffset, payload.length);
    
    const characterSet = view.getUint16(offset, true); offset += 2;
    const columnLength = view.getUint32(offset, true); offset += 4;
    const typeByte = payload[offset++];
    if (typeByte === undefined) throw new Error("Invalid field type");
    const flags = view.getUint16(offset, true); offset += 2;
    const decimalsByte = payload[offset++];
    if (decimalsByte === undefined) throw new Error("Invalid field decimals");

    return { catalog, schema, table, orgTable, name, orgName, characterSet, columnLength, type: typeByte, flags, decimals: decimalsByte };
  }

  parseBinaryRow(payload: Uint8Array, fields: MysqlField[]): any[] {
    const row: any[] = [];
    let offset = 1;
    const nullBitmapLength = Math.floor((fields.length + 7 + 2) / 8);
    if (offset + nullBitmapLength > payload.length) throw new Error("Binary row truncated (null bitmap)");
    const nullBitmap = payload.slice(offset, offset + nullBitmapLength);
    offset += nullBitmapLength;

    const view = new DataView(payload.buffer, payload.byteOffset, payload.length);

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      if (!field) continue;
      
      const idx = Math.floor((i + 2) / 8);
      const currentByte = nullBitmap[idx];
      const isNull = currentByte !== undefined && (currentByte & (1 << ((i + 2) % 8))) !== 0;
      
      if (isNull) {
        row.push(null);
        continue;
      }

      const type = field.type;
      switch (type) {
        case MYSQL_TYPES.TINY:
          if (offset + 1 > payload.length) throw new Error("Binary row truncated (TINY)");
          row.push(view.getInt8(offset)); offset += 1; break;
        case MYSQL_TYPES.SHORT:
        case MYSQL_TYPES.YEAR:
          if (offset + 2 > payload.length) throw new Error("Binary row truncated (SHORT/YEAR)");
          row.push(view.getInt16(offset, true)); offset += 2; break;
        case MYSQL_TYPES.INT24:
        case MYSQL_TYPES.LONG:
          if (offset + 4 > payload.length) throw new Error("Binary row truncated (LONG)");
          row.push(view.getInt32(offset, true)); offset += 4; break;
        case MYSQL_TYPES.LONGLONG:
          if (offset + 8 > payload.length) throw new Error("Binary row truncated (LONGLONG)");
          row.push(Number(view.getBigInt64(offset, true))); offset += 8; break;
        case MYSQL_TYPES.FLOAT:
          if (offset + 4 > payload.length) throw new Error("Binary row truncated (FLOAT)");
          row.push(view.getFloat32(offset, true)); offset += 4; break;
        case MYSQL_TYPES.DOUBLE:
          if (offset + 8 > payload.length) throw new Error("Binary row truncated (DOUBLE)");
          row.push(view.getFloat64(offset, true)); offset += 8; break;
        case MYSQL_TYPES.VARCHAR:
        case MYSQL_TYPES.VAR_STRING:
        case MYSQL_TYPES.STRING:
        case MYSQL_TYPES.JSON:
        case MYSQL_TYPES.BLOB:
        case MYSQL_TYPES.TINY_BLOB:
        case MYSQL_TYPES.MEDIUM_BLOB:
        case MYSQL_TYPES.LONG_BLOB:
        case MYSQL_TYPES.DECIMAL:
        case MYSQL_TYPES.NEWDECIMAL: {
          const { value: len, length: lenBytes } = this.readLenEnc(payload, offset);
          offset += lenBytes;
          const l = Number(len);
          if (offset + l > payload.length) throw new Error("Binary row truncated (string/blob data)");
          const str = this.decodeString(payload, offset, l);
          row.push(type === MYSQL_TYPES.JSON ? JSON.parse(str) : str);
          offset += l;
          break;
        }
        default:
          const { value: lenDate, length: lenBytesDate } = this.readLenEnc(payload, offset);
          offset += lenBytesDate;
          const ld = Number(lenDate);
          if (offset + ld > payload.length) throw new Error("Binary row truncated (date/time data)");
          offset += ld;
          row.push("Unsupported_Date_Time_Binary_Format");
          break;
      }
    }
    return row;
  }

  private lenEncLength(num: number): number {
    if (num < 251) return 1;
    if (num < 65536) return 3;
    if (num < 16777216) return 4;
    return 9;
  }

  private writeLenEnc(buf: Uint8Array, offset: number, num: number): number {
    if (num < 251) {
      buf[offset++] = num;
    } else if (num < 65536) {
      buf[offset++] = 0xfc;
      buf[offset++] = num & 0xff;
      buf[offset++] = (num >> 8) & 0xff;
    } else if (num < 16777216) {
      buf[offset++] = 0xfd;
      buf[offset++] = num & 0xff;
      buf[offset++] = (num >> 8) & 0xff;
      buf[offset++] = (num >> 16) & 0xff;
    } else {
      buf[offset++] = 0xfe;
      new DataView(buf.buffer).setUint32(offset, num, true);
      offset += 4;
      new DataView(buf.buffer).setUint32(offset, 0, true);
      offset += 4;
    }
    return offset;
  }

  private readLenEnc(buf: Uint8Array, offset: number): { value: number | bigint, length: number } {
    const first = buf[offset];
    if (first === undefined) return { value: 0, length: 0 };
    if (first < 251) return { value: first, length: 1 };
    const view = new DataView(buf.buffer, buf.byteOffset);
    if (first === 0xfc) return { value: view.getUint16(offset + 1, true), length: 3 };
    if (first === 0xfd) return { value: view.getUint32(offset + 1, true) & 0xffffff, length: 4 };
    if (first === 0xfe) return { value: view.getBigUint64(offset + 1, true), length: 9 };
    return { value: 0, length: 1 };
  }
}
