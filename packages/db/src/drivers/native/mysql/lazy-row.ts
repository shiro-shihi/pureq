import { type MysqlField, MysqlProtocol, MYSQL_TYPES } from "../../../protocol/mysql-wire.js";

const RAW_BYTES_SYMBOL = Symbol.for("pureq.rawBytes");

export function createMysqlLazyRowProxy<T>(
  rawData: Uint8Array,
  fields: MysqlField[],
  protocol: MysqlProtocol
): T {
  const view = new DataView(rawData.buffer, rawData.byteOffset, rawData.length);
  const cache = new Map<string | symbol, any>();
  let offsets: Int32Array | null = null;

  const ensureOffsets = () => {
    if (offsets) return;
    offsets = new Int32Array(fields.length * 2);
    
    const nullBitmapLength = Math.floor((fields.length + 7 + 2) / 8);
    const nullBitmap = rawData.slice(1, 1 + nullBitmapLength);
    
    let current = 1 + nullBitmapLength;

    for (let i = 0; i < fields.length; i++) {
      const idx = Math.floor((i + 2) / 8);
      const isNull = (nullBitmap[idx]! & (1 << ((i + 2) % 8))) !== 0;
      
      if (isNull) {
        offsets[i * 2] = -1;
        offsets[i * 2 + 1] = -1;
        continue;
      }

      const type = fields[i]!.type;
      let length = 0;
      const start = current;

      switch (type) {
        case MYSQL_TYPES.TINY: length = 1; break;
        case MYSQL_TYPES.SHORT:
        case MYSQL_TYPES.YEAR: length = 2; break;
        case MYSQL_TYPES.INT24:
        case MYSQL_TYPES.LONG: length = 4; break;
        case MYSQL_TYPES.LONGLONG:
        case MYSQL_TYPES.DOUBLE: length = 8; break;
        case MYSQL_TYPES.FLOAT: length = 4; break;
        default: {
          const { value: len, length: lenBytes } = (protocol as any).readLenEnc(rawData, current);
          length = lenBytes + Number(len);
          break;
        }
      }
      
      offsets[i * 2] = start;
      offsets[i * 2 + 1] = length;
      current += length;
    }
  };

  return new Proxy({} as any, {
    get(target, prop) {
      if (prop === RAW_BYTES_SYMBOL) return rawData;
      if (typeof prop !== "string") return undefined;

      if (cache.has(prop)) return cache.get(prop);

      const fieldIndex = fields.findIndex(f => f.name === prop);
      if (fieldIndex === -1) return undefined;

      ensureOffsets();
      const offset = offsets![fieldIndex * 2]!;
      const length = offsets![fieldIndex * 2 + 1]!;

      if (offset === -1) {
        cache.set(prop, null);
        return null;
      }

      const field = fields[fieldIndex]!;
      let value: any;

      if (field.type === MYSQL_TYPES.TINY) value = view.getInt8(offset);
      else if (field.type === MYSQL_TYPES.SHORT || field.type === MYSQL_TYPES.YEAR) value = view.getInt16(offset, true);
      else if (field.type === MYSQL_TYPES.INT24 || field.type === MYSQL_TYPES.LONG) value = view.getInt32(offset, true);
      else if (field.type === MYSQL_TYPES.LONGLONG) value = Number(view.getBigInt64(offset, true));
      else if (field.type === MYSQL_TYPES.FLOAT) value = view.getFloat32(offset, true);
      else if (field.type === MYSQL_TYPES.DOUBLE) value = view.getFloat64(offset, true);
      else {
        const { value: len, length: lenBytes } = (protocol as any).readLenEnc(rawData, offset);
        const str = new TextDecoder().decode(rawData.slice(offset + lenBytes, offset + lenBytes + Number(len)));
        value = field.type === MYSQL_TYPES.JSON ? JSON.parse(str) : str;
      }

      cache.set(prop, value);
      return value;
    },
    
    ownKeys() {
      return fields.map(f => f.name);
    },
    
    getOwnPropertyDescriptor(target, prop) {
      if (typeof prop === "string" && fields.some(f => f.name === prop)) {
        return { enumerable: true, configurable: true, writable: false };
      }
      return undefined;
    }
  });
}
