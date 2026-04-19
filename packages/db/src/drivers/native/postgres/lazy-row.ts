import { type FieldDescription, PgProtocol } from "../../../protocol/pg-wire.js";

const RAW_BYTES_SYMBOL = Symbol.for("pureq.rawBytes");

/**
 * World-Class Lazy Decoder.
 * 
 * Instead of allocating a Map for every single row, we use a flyweight pattern.
 * We calculate column offsets only on-demand and cache them at the row level
 * only if accessed.
 */
export function createLazyRowProxy<T>(
  rawData: Uint8Array,
  fields: FieldDescription[],
  protocol: PgProtocol
): T {
  // Pre-calculate field count and start of data
  const view = new DataView(rawData.buffer, rawData.byteOffset, rawData.length);
  const fieldCount = view.getInt16(0);
  
  // Cache for decoded values (lazy)
  const cache = new Map<string | symbol, any>();
  // Cache for field offsets (calculated on first access to ANY property)
  let offsets: Int32Array | null = null;

  const ensureOffsets = () => {
    if (offsets) return;
    offsets = new Int32Array(fieldCount * 2); // [offset, length, offset, length, ...]
    let current = 2;
    for (let i = 0; i < fieldCount; i++) {
      const len = view.getInt32(current);
      offsets[i * 2] = current + 4;
      offsets[i * 2 + 1] = len;
      current += 4 + (len === -1 ? 0 : len);
    }
  };

  return new Proxy({} as any, {
    get(target, prop) {
      if (prop === RAW_BYTES_SYMBOL) return rawData;
      if (typeof prop !== "string") return undefined;
      
      if (cache.has(prop)) return cache.get(prop);

      // Find field index by name
      const fieldIndex = fields.findIndex(f => f.name === prop);
      if (fieldIndex === -1) return undefined;

      ensureOffsets();
      const offset = offsets![fieldIndex * 2]!;
      const length = offsets![fieldIndex * 2 + 1]!;

      if (length === -1) {
        cache.set(prop, null);
        return null;
      }

      const field = fields[fieldIndex]!;
      const bufferSlice = rawData.subarray(offset, offset + length);
      
      const value = field.format === 1
        ? (protocol as any).decodeBinaryValue(bufferSlice, field.dataTypeOid)
        : (protocol as any).decodeTextValue(new TextDecoder().decode(bufferSlice), field.dataTypeOid);

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

export function getRawBytes(row: any): Uint8Array | undefined {
  return row[RAW_BYTES_SYMBOL];
}
