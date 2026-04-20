/**
 * Pureq Hyper-Codec (Maximum Hardening)
 * Slab-based Bitwise Serialization with Atomic Boundary Checks.
 */
import { TYPE_IDS } from "./types.js";

export class PureqHyperCodec {
  private static encoder = new TextEncoder();
  private static decoder = new TextDecoder();

  static encode(val: any, initialSlab?: Uint8Array): Uint8Array {
    let slab = initialSlab ?? new Uint8Array(4096);
    let offset = 0;

    const ensure = (size: number) => {
      if (offset + size > slab.length) {
        // Grow the slab exponentially to avoid O(N^2)
        const newSize = Math.max(slab.length * 2, offset + size);
        if (newSize > 128 * 1024 * 1024) { // 128MB absolute limit
          throw new Error(`Security Violation: Encoded data size ${newSize} exceeds maximum limit`);
        }
        const nextSlab = new Uint8Array(newSize);
        nextSlab.set(slab);
        slab = nextSlab;
      }
    };

    const write = (v: any) => {
      if (v === null || v === undefined) {
        ensure(1);
        slab[offset++] = TYPE_IDS.NULL;
      } else if (v instanceof Error) {
        ensure(1);
        slab[offset++] = TYPE_IDS.ERROR;
        write(v.message); // Recursive call will handle its own ensure()
      } else if (v instanceof Date) {
        ensure(9); // 1 (tag) + 8 (float64)
        slab[offset++] = TYPE_IDS.DATE;
        new DataView(slab.buffer, slab.byteOffset, slab.byteLength).setFloat64(offset, v.getTime(), true);
        offset += 8;
      } else if (v instanceof Uint8Array) {
        const len = v.length;
        ensure(5 + len); // 1 (tag) + 4 (uint32) + data
        slab[offset++] = TYPE_IDS.BUFFER;
        slab[offset++] = len & 0xff;
        slab[offset++] = (len >> 8) & 0xff;
        slab[offset++] = (len >> 16) & 0xff;
        slab[offset++] = (len >> 24) & 0xff;
        slab.set(v, offset);
        offset += len;
      } else if (typeof v === "boolean") {
        ensure(2); // 1 (tag) + 1 (byte)
        slab[offset++] = TYPE_IDS.BOOL;
        slab[offset++] = v ? 1 : 0;
      } else if (typeof v === "number") {
        if (Number.isInteger(v) && v >= -2147483648 && v <= 2147483647) {
          ensure(5); // 1 (tag) + 4 (int32)
          slab[offset++] = TYPE_IDS.INT;
          slab[offset++] = v & 0xff;
          slab[offset++] = (v >> 8) & 0xff;
          slab[offset++] = (v >> 16) & 0xff;
          slab[offset++] = (v >> 24) & 0xff;
        } else {
          ensure(9); // 1 (tag) + 8 (float64)
          slab[offset++] = TYPE_IDS.FLOAT;
          new DataView(slab.buffer, slab.byteOffset, slab.byteLength).setFloat64(offset, v, true);
          offset += 8;
        }
      } else if (typeof v === "string") {
        const bytes = this.encoder.encode(v);
        const len = bytes.length;
        ensure(5 + len); // 1 (tag) + 4 (uint32) + data
        slab[offset++] = TYPE_IDS.STRING;
        slab[offset++] = len & 0xff;
        slab[offset++] = (len >> 8) & 0xff;
        slab[offset++] = (len >> 16) & 0xff;
        slab[offset++] = (len >> 24) & 0xff;
        slab.set(bytes, offset);
        offset += len;
      } else if (Array.isArray(v)) {
        ensure(5); // 1 (tag) + 4 (uint32 length)
        slab[offset++] = TYPE_IDS.ARRAY;
        const len = v.length;
        slab[offset++] = len & 0xff;
        slab[offset++] = (len >> 8) & 0xff;
        slab[offset++] = (len >> 16) & 0xff;
        slab[offset++] = (len >> 24) & 0xff;
        for (const item of v) write(item);
      } else if (typeof v === "object") {
        const keys = Object.keys(v);
        const len = keys.length;
        ensure(5); // 1 (tag) + 4 (uint32 length)
        slab[offset++] = TYPE_IDS.OBJECT;
        slab[offset++] = len & 0xff;
        slab[offset++] = (len >> 8) & 0xff;
        slab[offset++] = (len >> 16) & 0xff;
        slab[offset++] = (len >> 24) & 0xff;
        for (const key of keys) {
          write(key);
          write(v[key]);
        }
      }
    };

    write(val);
    return slab.slice(0, offset);
  }

  static decode(buf: Uint8Array): any {
    let offset = 0;
    const view = new DataView(buf.buffer, buf.byteOffset, buf.length);

    const checkBound = (size: number) => {
      if (offset + size > buf.length) throw new Error(`Security Violation: Buffer out-of-bounds at ${offset}`);
    };

    const read = (): any => {
      checkBound(1);
      const type = buf[offset++];
      switch (type) {
        case TYPE_IDS.NULL: return null;
        case TYPE_IDS.BOOL: checkBound(1); return buf[offset++] === 1;
        case TYPE_IDS.INT: {
          checkBound(4);
          const val = (buf[offset]! | (buf[offset + 1]! << 8) | (buf[offset + 2]! << 16) | (buf[offset + 3]! << 24));
          offset += 4;
          return val;
        }
        case TYPE_IDS.FLOAT: {
          checkBound(8);
          const val = view.getFloat64(offset, true);
          offset += 8;
          return val;
        }
        case TYPE_IDS.STRING: {
          checkBound(4);
          const len = (buf[offset]! | (buf[offset + 1]! << 8) | (buf[offset + 2]! << 16) | (buf[offset + 3]! << 24)) >>> 0;
          offset += 4;
          if (len > 16 * 1024 * 1024) throw new Error("Security Violation: String length exceeds limit");
          checkBound(len);
          const str = this.decoder.decode(buf.subarray(offset, offset + len));
          offset += len;
          return str;
        }
        case TYPE_IDS.DATE: {
          checkBound(8);
          const time = view.getFloat64(offset, true);
          offset += 8;
          return new Date(time);
        }
        case TYPE_IDS.ERROR: return new Error(read());
        case TYPE_IDS.ARRAY: {
          checkBound(4);
          const len = (buf[offset]! | (buf[offset + 1]! << 8) | (buf[offset + 2]! << 16) | (buf[offset + 3]! << 24)) >>> 0;
          offset += 4;
          if (len > 1000000) throw new Error("Security Violation: Array too large");
          const arr = new Array(len);
          for (let i = 0; i < len; i++) arr[i] = read();
          return arr;
        }
        case TYPE_IDS.OBJECT: {
          checkBound(4);
          const len = (buf[offset]! | (buf[offset + 1]! << 8) | (buf[offset + 2]! << 16) | (buf[offset + 3]! << 24)) >>> 0;
          offset += 4;
          if (len > 1000000) throw new Error("Security Violation: Object has too many properties");
          const obj: any = {};
          for (let i = 0; i < len; i++) {
            const key = read();
            obj[key] = read();
          }
          return obj;
        }
        case TYPE_IDS.BUFFER: {
          checkBound(4);
          const len = (buf[offset]! | (buf[offset + 1]! << 8) | (buf[offset + 2]! << 16) | (buf[offset + 3]! << 24)) >>> 0;
          offset += 4;
          checkBound(len);
          const data = buf.slice(offset, offset + len);
          offset += len;
          return data;
        }
        default: throw new Error(`Security Violation: Unknown type tag ${type} at offset ${offset - 1}`);
      }
    };
    return read();
  }
}
