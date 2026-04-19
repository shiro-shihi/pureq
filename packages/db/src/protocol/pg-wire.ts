/**
 * Pure TypeScript Postgres Wire Protocol implementation.
 * Zero dependencies on Node.js. Uses Uint8Array and DataView.
 * Supports Binary Data Transfer, detailed Error parsing, and Custom Type Decoders.
 */

export type PgMessageType = string;

export interface PgMessage {
  type: PgMessageType;
  data: Uint8Array;
}

export interface FieldDescription {
  name: string;
  tableOid: number;
  columnAttr: number;
  dataTypeOid: number;
  dataTypeSize: number;
  typeModifier: number;
  format: number; // 0 = text, 1 = binary
}

export interface PgErrorDetails {
  severity: string;
  code: string;
  message: string;
  detail?: string;
  hint?: string;
  position?: string;
  internalPosition?: string;
  internalQuery?: string;
  where?: string;
  schema?: string;
  table?: string;
  column?: string;
  dataTypeName?: string;
  constraint?: string;
  file?: string;
  line?: string;
  routine?: string;
}

export const PgOids = {
  BOOL: 16,
  BYTEA: 17,
  CHAR: 18,
  NAME: 19,
  INT8: 20,
  INT2: 21,
  INT4: 23,
  TEXT: 25,
  OID: 26,
  JSON: 114,
  FLOAT4: 700,
  FLOAT8: 701,
  INET: 869,
  VARCHAR: 1043,
  DATE: 1082,
  TIME: 1083,
  TIMESTAMP: 1114,
  TIMESTAMPTZ: 1184,
  NUMERIC: 1700,
  UUID: 2950,
  JSONB: 3802,
  BOOL_ARRAY: 1000,
  INT2_ARRAY: 1005,
  INT4_ARRAY: 1007,
  INT8_ARRAY: 1016,
  TEXT_ARRAY: 1009,
  VARCHAR_ARRAY: 1015,
  FLOAT4_ARRAY: 1021,
  FLOAT8_ARRAY: 1022,
} as const;

export interface PgNotification {
  processId: number;
  channel: string;
  payload: string;
}

export type PgDecoder = (buf: Uint8Array) => any;

export class PgProtocol {
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();
  private customDecoders: Map<number, PgDecoder> = new Map();
  private stringCache = new Map<string, string>();
  private static readonly MAX_CACHE_SIZE = 1000;

  /**
   * Ultra-fast ASCII decoder with String Interning.
   * Reuses string objects to keep pointer identity for faster comparisons and lower memory.
   */
  private fastDecode(buf: Uint8Array, start: number, end: number): string {
    const len = end - start;
    if (len === 0) return "";
    if (len < 64) {
      let isAscii = true;
      for (let i = start; i < end; i++) {
        if (buf[i]! > 127) { isAscii = false; break; }
      }
      if (isAscii) {
        let str = "";
        for (let i = start; i < end; i++) {
          str += String.fromCharCode(buf[i]!);
        }
        return str;
      }
    }
    return this.decoder.decode(buf.subarray(start, end));
  }

  // Raw bitwise replacement for DataView.getInt32 (Big Endian)
  private readInt32(buf: Uint8Array, offset: number): number {
    return (buf[offset]! << 24) | (buf[offset + 1]! << 16) | (buf[offset + 2]! << 8) | buf[offset + 3]!;
  }

  // Raw bitwise replacement for DataView.getInt16 (Big Endian)
  private readInt16(buf: Uint8Array, offset: number): number {
    return (buf[offset]! << 8) | buf[offset + 1]!;
  }

  /**
   * Registers a custom binary decoder for a specific Postgres OID.
   */
  registerDecoder(oid: number, decoder: PgDecoder): void {
    this.customDecoders.set(oid, decoder);
  }

  encodeCancelRequest(processId: number, secretKey: number): Uint8Array {
    const buffer = new Uint8Array(16);
    const view = new DataView(buffer.buffer);
    view.setInt32(0, 16);
    view.setInt32(4, 80877102);
    view.setInt32(8, processId);
    view.setInt32(12, secretKey);
    return buffer;
  }

  encodePassword(password: string): Uint8Array {
    const passBytes = this.encoder.encode(password);
    const size = 4 + passBytes.length + 1;
    const buffer = new Uint8Array(size + 1);
    buffer[0] = "p".charCodeAt(0);
    new DataView(buffer.buffer).setInt32(1, size);
    buffer.set(passBytes, 5);
    return buffer;
  }

  encodeSASLInitialResponse(mechanism: string, clientFirstMessage: string): Uint8Array {
    const mechBytes = this.encoder.encode(mechanism);
    const msgBytes = this.encoder.encode(clientFirstMessage);
    const size = 4 + mechBytes.length + 1 + 4 + msgBytes.length;
    const buffer = new Uint8Array(size + 1);
    buffer[0] = "p".charCodeAt(0);
    const view = new DataView(buffer.buffer);
    view.setInt32(1, size);
    let offset = 5;
    buffer.set(mechBytes, offset); offset += mechBytes.length + 1;
    view.setInt32(offset, msgBytes.length); offset += 4;
    buffer.set(msgBytes, offset);
    return buffer;
  }

  encodeSASLResponse(clientFinalMessage: string): Uint8Array {
    const msgBytes = this.encoder.encode(clientFinalMessage);
    const size = 4 + msgBytes.length;
    const buffer = new Uint8Array(size + 1);
    buffer[0] = "p".charCodeAt(0);
    new DataView(buffer.buffer).setInt32(1, size);
    buffer.set(msgBytes, 5);
    return buffer;
  }

  encodeSSLRequest(): Uint8Array {
    const buffer = new Uint8Array(8);
    const view = new DataView(buffer.buffer);
    view.setInt32(0, 8);
    view.setInt32(4, 80877103);
    return buffer;
  }

  encodeStartupMessage(user: string, database: string): Uint8Array {
    const params: Record<string, string> = { user, database, client_encoding: "UTF8" };
    let size = 8;
    for (const [k, v] of Object.entries(params)) size += (k?.length ?? 0) + 1 + (v?.length ?? 0) + 1;
    size += 1;

    const buffer = new Uint8Array(size);
    const view = new DataView(buffer.buffer);
    view.setInt32(0, size);
    view.setInt32(4, 196608);

    let offset = 8;
    for (const [k, v] of Object.entries(params)) {
      if (k) {
        buffer.set(this.encoder.encode(k), offset);
        offset += k.length + 1;
      }
      if (v) {
        buffer.set(this.encoder.encode(v), offset);
        offset += v.length + 1;
      }
    }
    buffer[offset] = 0;
    return buffer;
  }

  encodeParse(statementName: string, query: string, paramOids: number[] = []): Uint8Array {
    const nameBytes = this.encoder.encode(statementName);
    const queryBytes = this.encoder.encode(query);
    const size = 4 + nameBytes.length + 1 + queryBytes.length + 1 + 2 + (paramOids.length * 4);
    
    const buffer = new Uint8Array(size + 1);
    buffer[0] = "P".charCodeAt(0);
    const view = new DataView(buffer.buffer);
    view.setInt32(1, size);
    
    let offset = 5;
    buffer.set(nameBytes, offset); offset += nameBytes.length + 1;
    buffer.set(queryBytes, offset); offset += queryBytes.length + 1;
    
    view.setInt16(offset, paramOids.length); offset += 2;
    for (const oid of paramOids) {
      view.setInt32(offset, oid); offset += 4;
    }
    return buffer;
  }

  encodeBind(portalName: string, statementName: string, params: any[], resultFormats: number[] = []): Uint8Array {
    const pNameBytes = this.encoder.encode(portalName);
    const sNameBytes = this.encoder.encode(statementName);
    
    const encodedParams = params.map(p => {
      if (p === null || p === undefined) return null;
      if (p instanceof Uint8Array) return p;
      return typeof p === 'string' ? this.encoder.encode(p) : this.encoder.encode(JSON.stringify(p));
    });

    let paramsSize = 0;
    for (const p of encodedParams) {
      paramsSize += 4 + (p ? p.length : 0);
    }

    const rfCount = resultFormats.length === 0 ? 1 : resultFormats.length;
    const size = 4 + pNameBytes.length + 1 + sNameBytes.length + 1 + 
                 2 + 2 + 
                 2 + paramsSize + 
                 2 + (rfCount * 2);

    const buffer = new Uint8Array(size + 1);
    buffer[0] = "B".charCodeAt(0);
    const view = new DataView(buffer.buffer);
    view.setInt32(1, size);

    let offset = 5;
    buffer.set(pNameBytes, offset); offset += pNameBytes.length + 1;
    buffer.set(sNameBytes, offset); offset += sNameBytes.length + 1;
    
    view.setInt16(offset, 1); offset += 2;
    view.setInt16(offset, 0); offset += 2;
    
    view.setInt16(offset, encodedParams.length); offset += 2;
    for (const p of encodedParams) {
      if (p === null) {
        view.setInt32(offset, -1); offset += 4;
      } else {
        view.setInt32(offset, p.length); offset += 4;
        buffer.set(p, offset); offset += p.length;
      }
    }

    view.setInt16(offset, rfCount); offset += 2;
    if (resultFormats.length === 0) {
      view.setInt16(offset, 1); offset += 2;
    } else {
      for (const rf of resultFormats) {
        view.setInt16(offset, rf); offset += 2;
      }
    }

    return buffer;
  }

  encodeDescribe(type: 'S' | 'P', name: string): Uint8Array {
    const nameBytes = this.encoder.encode(name);
    const size = 4 + 1 + nameBytes.length + 1;
    const buffer = new Uint8Array(size + 1);
    buffer[0] = "D".charCodeAt(0);
    const view = new DataView(buffer.buffer);
    view.setInt32(1, size);
    buffer[5] = type.charCodeAt(0);
    buffer.set(nameBytes, 6);
    return buffer;
  }

  encodeExecute(portalName: string, maxRows: number = 0): Uint8Array {
    const nameBytes = this.encoder.encode(portalName);
    const size = 4 + nameBytes.length + 1 + 4;
    const buffer = new Uint8Array(size + 1);
    buffer[0] = "E".charCodeAt(0);
    const view = new DataView(buffer.buffer);
    view.setInt32(1, size);
    buffer.set(nameBytes, 5);
    view.setInt32(5 + nameBytes.length + 1, maxRows);
    return buffer;
  }

  encodeSync(): Uint8Array {
    const buffer = new Uint8Array(5);
    buffer[0] = "S".charCodeAt(0);
    new DataView(buffer.buffer).setInt32(1, 4);
    return buffer;
  }

  decodeMessage(buffer: Uint8Array): { message: PgMessage; consumed: number } | null {
    if (buffer.length < 5) return null;
    const type = String.fromCharCode(buffer[0] || 0);
    const view = new DataView(buffer.buffer, buffer.byteOffset);
    const length = view.getInt32(1);
    if (buffer.length < length + 1) return null;

    return {
      message: { type, data: buffer.slice(5, length + 1) },
      consumed: length + 1,
    };
  }

  parseErrorResponse(data: Uint8Array): PgErrorDetails {
    const error: Partial<PgErrorDetails> = {};
    let offset = 0;
    while (offset < data.length - 1) {
      const charCode = data[offset];
      if (charCode === undefined) break;
      const code = String.fromCharCode(charCode);
      offset++;
      let nullIndex = offset;
      while (data[nullIndex] !== 0 && nullIndex < data.length) nullIndex++;
      const value = this.decoder.decode(data.slice(offset, nullIndex));
      offset = nullIndex + 1;

      switch (code) {
        case 'S': error.severity = value; break;
        case 'C': error.code = value; break;
        case 'M': error.message = value; break;
        case 'D': error.detail = value; break;
        case 'H': error.hint = value; break;
        case 'P': error.position = value; break;
        case 'p': error.internalPosition = value; break;
        case 'q': error.internalQuery = value; break;
        case 'W': error.where = value; break;
        case 's': error.schema = value; break;
        case 't': error.table = value; break;
        case 'c': error.column = value; break;
        case 'd': error.dataTypeName = value; break;
        case 'n': error.constraint = value; break;
        case 'F': error.file = value; break;
        case 'L': error.line = value; break;
        case 'R': error.routine = value; break;
      }
    }
    return error as PgErrorDetails;
  }

  parseRowDescription(data: Uint8Array): FieldDescription[] {
    if (data.length < 2) throw new Error("Invalid RowDescription: too short");
    const fieldCount = this.readInt16(data, 0);
    const fields: FieldDescription[] = [];
    let offset = 2;

    for (let i = 0; i < fieldCount; i++) {
      if (offset >= data.length) throw new Error("Invalid RowDescription: unexpected end of data");
      let nullIndex = offset;
      while (nullIndex < data.length && data[nullIndex] !== 0) nullIndex++;
      if (nullIndex >= data.length) throw new Error("Invalid RowDescription: name not null-terminated");
      
      const name = this.fastDecode(data, offset, nullIndex);
      offset = nullIndex + 1;

      if (offset + 18 > data.length) throw new Error("Invalid RowDescription: field metadata truncated");
      
      fields.push({
        name,
        tableOid: this.readInt32(data, offset),
        columnAttr: this.readInt16(data, offset + 4),
        dataTypeOid: this.readInt32(data, offset + 6),
        dataTypeSize: this.readInt16(data, offset + 10),
        typeModifier: this.readInt32(data, offset + 12),
        format: this.readInt16(data, offset + 16),
      });
      offset += 18;
    }
    return fields;
  }

  parseDataRow(data: Uint8Array, fields: FieldDescription[]): Record<string, any> {
    if (data.length < 2) throw new Error("Invalid DataRow: too short");
    const fieldCount = this.readInt16(data, 0);
    const row: Record<string, any> = {};
    let offset = 2;

    for (let i = 0; i < fieldCount; i++) {
      if (offset + 4 > data.length) throw new Error("Invalid DataRow: field length truncated");
      const length = this.readInt32(data, offset);
      offset += 4;
      
      if (length === -1) {
        const field = fields[i];
        if (field) row[field.name] = null;
        continue;
      }

      if (length < 0) throw new Error(`Invalid DataRow: negative field length ${length}`);
      if (offset + length > data.length) throw new Error("Invalid DataRow: field data truncated");

      const field = fields[i];
      if (!field) {
        offset += length;
        continue;
      }

      // Fast-path for common types to avoid function call overhead
      const oid = field.dataTypeOid;
      if (field.format === 0) { // Text format
        const textVal = this.fastDecode(data, offset, offset + length);
        if (oid === PgOids.INT4) {
          row[field.name] = parseInt(textVal, 10);
        } else if (oid === PgOids.VARCHAR || oid === PgOids.TEXT) {
          row[field.name] = textVal;
        } else if (oid === PgOids.BOOL) {
          row[field.name] = textVal === "t";
        } else {
          row[field.name] = this.decodeTextValue(textVal, oid);
        }
      } else { // Binary format
        if (oid === PgOids.INT4) {
          row[field.name] = this.readInt32(data, offset);
        } else if (oid === PgOids.VARCHAR || oid === PgOids.TEXT) {
          row[field.name] = this.fastDecode(data, offset, offset + length);
        } else {
          row[field.name] = this.decodeBinaryValue(data.subarray(offset, offset + length), oid);
        }
      }
      
      offset += length;
    }
    return row;
  }

  parseNotification(data: Uint8Array): PgNotification {
    const view = new DataView(data.buffer, data.byteOffset);
    const processId = view.getInt32(0);
    let offset = 4;
    
    let nullIdx = data.indexOf(0, offset);
    const channel = this.decoder.decode(data.slice(offset, nullIdx));
    offset = nullIdx + 1;
    
    nullIdx = data.indexOf(0, offset);
    const payload = this.decoder.decode(data.slice(offset, nullIdx));
    
    return { processId, channel, payload };
  }

  private decodeBinaryValue(buf: Uint8Array, oid: number): any {
    const custom = this.customDecoders.get(oid);
    if (custom) return custom(buf);

    const view = new DataView(buf.buffer, buf.byteOffset, buf.length);
    switch (oid) {
      case PgOids.BOOL: return buf[0] !== 0;
      case PgOids.INT2: return view.getInt16(0);
      case PgOids.INT4: return view.getInt32(0);
      case PgOids.INT8: return Number(view.getBigInt64(0));
      case PgOids.FLOAT4: return view.getFloat32(0);
      case PgOids.FLOAT8: return view.getFloat64(0);
      case PgOids.TIMESTAMP:
      case PgOids.TIMESTAMPTZ: {
        const microsecs = Number(view.getBigInt64(0));
        return new Date(946684800000 + microsecs / 1000);
      }
      case PgOids.JSON:
      case PgOids.JSONB: {
        const str = this.decoder.decode(oid === PgOids.JSONB ? buf.slice(1) : buf);
        return JSON.parse(str);
      }
      case PgOids.BYTEA: return buf;
      case PgOids.UUID: {
        const hex = Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
      }
      case PgOids.INET: return this.decoder.decode(buf);
      case PgOids.BOOL_ARRAY:
      case PgOids.INT2_ARRAY:
      case PgOids.INT4_ARRAY:
      case PgOids.INT8_ARRAY:
      case PgOids.TEXT_ARRAY:
      case PgOids.VARCHAR_ARRAY:
      case PgOids.FLOAT4_ARRAY:
      case PgOids.FLOAT8_ARRAY:
        return this.decodeBinaryArray(buf, oid);
      default:
        // Try simple EWKB detection if OID looks like PostGIS (often starts with 3000+ or custom)
        return this.decoder.decode(buf);
    }
  }

  private decodeBinaryArray(buf: Uint8Array, arrayOid: number): any[] {
    if (buf.length < 12) return [];
    const view = new DataView(buf.buffer, buf.byteOffset, buf.length);
    const ndim = view.getInt32(0);
    if (ndim === 0) return [];
    if (ndim > 8) throw new Error(`Security Exception: Array dimensions too deep (${ndim})`);
    
    const elementOid = view.getInt32(8);
    let offset = 12;
    const dims: number[] = [];
    for (let i = 0; i < ndim; i++) {
        if (offset + 8 > buf.length) throw new Error("Binary array truncated (dimensions)");
        dims.push(view.getInt32(offset));
        offset += 8;
    }
    return this.readArrayElements(buf, offset, dims, elementOid, 0);
  }

  private readArrayElements(buf: Uint8Array, offset: number, dims: number[], elementOid: number, depth: number): any {
    if (depth > 8) throw new Error("Security Exception: Array recursion depth exceeded");
    const view = new DataView(buf.buffer, buf.byteOffset, buf.length);
    const dim = dims[0]!;
    if (dim < 0 || dim > 1000000) throw new Error(`Invalid array dimension: ${dim}`);
    
    const remainingDims = dims.slice(1);
    const result = [];
    let currentOffset = offset;
    
    for (let i = 0; i < dim; i++) {
        if (remainingDims.length > 0) {
            const { value, nextOffset } = this.readArrayElements(buf, currentOffset, remainingDims, elementOid, depth + 1);
            result.push(value);
            currentOffset = nextOffset;
        } else {
            if (currentOffset + 4 > buf.length) throw new Error("Binary array truncated (element length)");
            const len = view.getInt32(currentOffset);
            currentOffset += 4;
            if (len === -1) {
                result.push(null);
            } else {
                if (len < 0 || currentOffset + len > buf.length) throw new Error("Binary array truncated (element data)");
                result.push(this.decodeBinaryValue(buf.slice(currentOffset, currentOffset + len), elementOid));
                currentOffset += len;
            }
        }
    }
    return remainingDims.length > 0 ? { value: result, nextOffset: currentOffset } : result;
  }

  private decodeTextValue(val: string, oid: number): any {
    switch (oid) {
      case PgOids.BOOL: return val === "t";
      case PgOids.INT2:
      case PgOids.INT4:
      case PgOids.INT8: return parseInt(val, 10);
      case PgOids.FLOAT4:
      case PgOids.FLOAT8:
      case PgOids.NUMERIC: return parseFloat(val);
      case PgOids.JSON:
      case PgOids.JSONB: return JSON.parse(val);
      case PgOids.DATE:
      case PgOids.TIMESTAMP:
      case PgOids.TIMESTAMPTZ: return new Date(val);
      default: return val;
    }
  }
}
