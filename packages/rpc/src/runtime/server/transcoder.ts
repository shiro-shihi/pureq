/**
 * @pureq/rpc v1.0.0 - Binary Transcoder
 * Direct DB-to-RPC binary conversion with Physical Masking.
 */
import { PgOids } from "../../../../db/src/protocol/pg-wire.js";
import { TYPE_IDS } from "../shared/types.js";

export class BinaryTranscoder {
  private static encoder = new TextEncoder();

  /**
   * Physically copies only whitelisted fields from DB binary to RPC binary.
   */
  static transcodePgRow(
    data: Uint8Array, 
    fields: any[], 
    whitelist: Set<string>,
    slab: Uint8Array,
    offset: number
  ): number {
    let inputOffset = 2; // Skip Int16 count
    let out = offset;

    slab[out++] = TYPE_IDS.OBJECT;
    const count = fields.filter(f => whitelist.has(f.name)).length;
    slab[out++] = count & 0xff;
    slab[out++] = (count >> 8) & 0xff;
    slab[out++] = (count >> 16) & 0xff;
    slab[out++] = (count >> 24) & 0xff;

    for (let i = 0; i < fields.length; i++) {
      const f = fields[i]!;
      const len = (data[inputOffset]! << 24) | (data[inputOffset + 1]! << 16) | (data[inputOffset + 2]! << 8) | data[inputOffset + 3]!;
      inputOffset += 4;

      if (!whitelist.has(f.name)) {
        if (len !== -1) inputOffset += len;
        continue;
      }

      // 1. Key
      out = this.writeString(slab, out, f.name);

      // 2. Value
      if (len === -1) {
        slab[out++] = TYPE_IDS.NULL;
      } else {
        const valBuf = data.subarray(inputOffset, inputOffset + len);
        inputOffset += len;
        out = this.writeValue(slab, out, valBuf, f.dataTypeOid);
      }
    }
    return out;
  }

  private static writeString(slab: Uint8Array, out: number, s: string): number {
    const bytes = this.encoder.encode(s);
    slab[out++] = TYPE_IDS.STRING;
    const len = bytes.length;
    slab[out++] = len & 0xff;
    slab[out++] = (len >> 8) & 0xff;
    slab[out++] = (len >> 16) & 0xff;
    slab[out++] = (len >> 24) & 0xff;
    slab.set(bytes, out);
    return out + len;
  }

  private static writeValue(slab: Uint8Array, out: number, buf: Uint8Array, oid: number): number {
    switch (oid) {
      case PgOids.INT4:
        slab[out++] = TYPE_IDS.INT;
        slab[out++] = buf[3]!; slab[out++] = buf[2]!; slab[out++] = buf[1]!; slab[out++] = buf[0]!;
        return out;
      case PgOids.BOOL:
        slab[out++] = TYPE_IDS.BOOL;
        slab[out++] = buf[0] !== 0 ? 1 : 0;
        return out;
      default:
        // Generic String/Binary fallback
        slab[out++] = TYPE_IDS.STRING;
        const len = buf.length;
        slab[out++] = len & 0xff;
        slab[out++] = (len >> 8) & 0xff;
        slab[out++] = (len >> 16) & 0xff;
        slab[out++] = (len >> 24) & 0xff;
        slab.set(buf, out);
        return out + len;
    }
  }
}
