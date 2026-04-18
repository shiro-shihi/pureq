/**
 * Pure TypeScript Postgres Wire Protocol implementation.
 * Zero dependencies on Node.js. Uses Uint8Array and DataView.
 * Supports Binary Data Transfer and detailed Error parsing.
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
  INT8: 20,
  INT2: 21,
  INT4: 23,
  TEXT: 25,
  JSON: 114,
  FLOAT4: 700,
  FLOAT8: 701,
  VARCHAR: 1043,
  DATE: 1082,
  TIMESTAMP: 1114,
  TIMESTAMPTZ: 1184,
  NUMERIC: 1700,
  JSONB: 3802,
  UUID: 2950,
} as const;

export class PgProtocol {
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();

  encodePassword(password: string): Uint8Array {
    const passBytes = this.encoder.encode(password);
    const size = 4 + passBytes.length + 1;
    const buffer = new Uint8Array(size + 1);
    buffer[0] = "p".charCodeAt(0);
    new DataView(buffer.buffer).setInt32(1, size);
    buffer.set(passBytes, 5);
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
    view.setInt32(4, 196608); // Protocol 3.0

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
      return typeof p === 'string' ? this.encoder.encode(p) : this.encoder.encode(JSON.stringify(p));
    });

    let paramsSize = 0;
    for (const p of encodedParams) {
      paramsSize += 4 + (p ? p.length : 0);
    }

    const rfCount = resultFormats.length === 0 ? 1 : resultFormats.length;
    const size = 4 + pNameBytes.length + 1 + sNameBytes.length + 1 + 
                 2 + 2 + // param format codes
                 2 + paramsSize + // params
                 2 + (rfCount * 2); // result format codes

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
    const view = new DataView(data.buffer, data.byteOffset);
    const fieldCount = view.getInt16(0);
    const fields: FieldDescription[] = [];
    let offset = 2;

    for (let i = 0; i < fieldCount; i++) {
      let nullIndex = offset;
      while (data[nullIndex] !== 0 && nullIndex < data.length) nullIndex++;
      const name = this.decoder.decode(data.slice(offset, nullIndex));
      offset = nullIndex + 1;

      fields.push({
        name,
        tableOid: view.getInt32(offset),
        columnAttr: view.getInt16(offset + 4),
        dataTypeOid: view.getInt32(offset + 6),
        dataTypeSize: view.getInt16(offset + 10),
        typeModifier: view.getInt32(offset + 12),
        format: view.getInt16(offset + 16),
      });
      offset += 18;
    }
    return fields;
  }

  parseDataRow(data: Uint8Array, fields: FieldDescription[]): any[] {
    const view = new DataView(data.buffer, data.byteOffset);
    const fieldCount = view.getInt16(0);
    const row: any[] = [];
    let offset = 2;

    for (let i = 0; i < fieldCount; i++) {
      const length = view.getInt32(offset);
      offset += 4;
      if (length === -1) {
        row.push(null);
        continue;
      }

      const field = fields[i];
      if (!field) {
        offset += length;
        row.push(null);
        continue;
      }

      const bufferSlice = data.slice(offset, offset + length);
      if (field.format === 1) {
        row.push(this.decodeBinaryValue(bufferSlice, field.dataTypeOid));
      } else {
        const textVal = this.decoder.decode(bufferSlice);
        row.push(this.decodeTextValue(textVal, field.dataTypeOid));
      }
      
      offset += length;
    }
    return row;
  }

  private decodeBinaryValue(buf: Uint8Array, oid: number): any {
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
      default:
        return this.decoder.decode(buf);
    }
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
