import { describe, it, expect } from "vitest";
import { BinaryTranscoder } from "../src/runtime/server/transcoder.ts";
import { PgOids } from "../../db/src/protocol/pg-wire.ts";
import { PureqHyperCodec } from "../src/runtime/shared/codec.ts";

describe("BinaryTranscoder (Physical Masking)", () => {
  const slab = new Uint8Array(1024 * 1024);

  it("should transcode PG binary and apply masking", () => {
    // 2 columns: 'id' (INT4) and 'secret' (TEXT)
    const fields = [
      { name: "id", dataTypeOid: PgOids.INT4 },
      { name: "secret", dataTypeOid: PgOids.TEXT }
    ];

    // Raw PG DataRow packet
    // Column Count: 2
    // Col 1: len 4, val 100
    // Col 2: len 4, val "S3CR"
    const rawPgData = new Uint8Array([
      0, 2, // 2 cols
      0, 0, 0, 4, 0, 0, 0, 100, // id: 100
      0, 0, 0, 4, 83, 51, 67, 82  // secret: "S3CR"
    ]);

    // Whitelist only 'id'
    const whitelist = new Set(["id"]);
    
    const outOffset = BinaryTranscoder.transcodePgRow(rawPgData, fields, whitelist, slab, 0);
    const transcoded = slab.slice(0, outOffset);

    // Decode and verify
    const decoded = PureqHyperCodec.decode(transcoded);
    expect(decoded.id).toBe(100);
    expect(decoded.secret).toBeUndefined(); // PHYSICAL MASKING WORKED!
    expect(Object.keys(decoded).length).toBe(1);
  });
});
