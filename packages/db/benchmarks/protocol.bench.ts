import { run, bench, group } from "mitata";
import { PgProtocol, PgOids } from "../src/protocol/pg-wire.js";
import { createLazyRowProxy } from "../src/drivers/native/postgres/lazy-row.js";

/**
 * PROTOCOL PARSING PERFORMANCE (Pureq vs Theoretical Limit)
 * 
 * This benchmark measures the raw speed of our Binary-First decoding.
 */

const protocol = new PgProtocol();
const fields = [
  { name: "id", tableOid: 0, columnAttr: 0, dataTypeOid: PgOids.INT4, dataTypeSize: 4, typeModifier: 0, format: 1 },
  { name: "name", tableOid: 0, columnAttr: 0, dataTypeOid: PgOids.TEXT, dataTypeSize: -1, typeModifier: 0, format: 1 },
  { name: "email", tableOid: 0, columnAttr: 0, dataTypeOid: PgOids.TEXT, dataTypeSize: -1, typeModifier: 0, format: 1 }
];

// Sample Postgres DataRow packet (Binary Format)
// Length 3 fields, then [4 bytes ID, length-prefixed string, length-prefixed string]
const sampleDataRow = new Uint8Array([
  0, 3, // column count
  0, 0, 0, 4, 0, 0, 0, 123, // col 1: 4 bytes, value 123
  0, 0, 0, 5, 65, 108, 105, 99, 101, // col 2: 5 bytes, "Alice"
  0, 0, 0, 17, 97, 108, 105, 99, 101, 64, 101, 120, 97, 109, 112, 108, 101, 46, 99, 111, 109 // col 3: 17 bytes, "alice@example.com"
]);

group("Binary Row Decoding (Single Row)", () => {
  bench("Pureq: createLazyRowProxy (Zero-Decoding)", () => {
    // Only wraps the buffer in a proxy. No actual field decoding.
    const row = createLazyRowProxy<any>(sampleDataRow, fields, protocol);
  });

  bench("Pureq: Full Access (Lazy Decoding)", () => {
    const row = createLazyRowProxy<any>(sampleDataRow, fields, protocol);
    const id = row.id;
    const name = row.name;
    const email = row.email;
  });

  bench("Legacy-style: Eager Decoding (Full Loop)", () => {
    // Simulating how 'pg' and others parse every row immediately.
    const view = new DataView(sampleDataRow.buffer, sampleDataRow.byteOffset);
    const row: any = {};
    let offset = 2;
    for (let i = 0; i < 3; i++) {
        const len = view.getInt32(offset);
        offset += 4;
        const slice = sampleDataRow.subarray(offset, offset + len);
        row[fields[i]!.name] = i === 0 ? view.getInt32(offset) : new TextDecoder().decode(slice);
        offset += len;
    }
  });
});

await run();
