import { run, bench, group } from "mitata";
import { PgProtocol, PgOids } from "../src/protocol/pg-wire.js";
import { createLazyRowProxy } from "../src/drivers/native/postgres/lazy-row.js";

/**
 * HYBRID DECODING PERFORMANCE BENCHMARK
 */

const protocol = new PgProtocol();

// Case A: Small row (3 columns) - Eager should win
const smallFields = [
  { name: "id", tableOid: 0, columnAttr: 0, dataTypeOid: PgOids.INT4, dataTypeSize: 4, typeModifier: 0, format: 1 },
  { name: "name", tableOid: 0, columnAttr: 0, dataTypeOid: PgOids.TEXT, dataTypeSize: -1, typeModifier: 0, format: 1 },
  { name: "email", tableOid: 0, columnAttr: 0, dataTypeOid: PgOids.TEXT, dataTypeSize: -1, typeModifier: 0, format: 1 }
];
const smallDataRow = new Uint8Array([
  0, 3, 
  0, 0, 0, 4, 0, 0, 0, 123,
  0, 0, 0, 5, 65, 108, 105, 99, 101,
  0, 0, 0, 17, 97, 108, 105, 99, 101, 64, 101, 120, 97, 109, 112, 108, 101, 46, 99, 111, 109
]);

// Case B: Large row (20 columns) - Lazy should win for memory and selective access
const largeFields = Array.from({ length: 20 }).map((_, i) => ({
  name: `col_${i}`, tableOid: 0, columnAttr: 0, dataTypeOid: PgOids.TEXT, dataTypeSize: -1, typeModifier: 0, format: 1
}));
const largeDataRowParts = [0, 20]; // col count
for (let i = 0; i < 20; i++) {
  largeDataRowParts.push(0, 0, 0, 4, 100, 101, 102, 103); // 4 bytes each
}
const largeDataRow = new Uint8Array(largeDataRowParts);

group("Small Row (3 cols) - Pure Execution Speed", () => {
  bench("Eager Decoding (Standard)", () => {
    const row = protocol.parseDataRow(smallDataRow, smallFields);
    const val = row.name;
  });

  bench("Lazy Decoding (Proxy)", () => {
    const row = createLazyRowProxy<any>(smallDataRow, smallFields, protocol);
    const val = row.name;
  });
});

group("Large Row (20 cols) - Memory & Selective Access", () => {
  bench("Eager Decoding (Full Parse)", () => {
    const row = protocol.parseDataRow(largeDataRow, largeFields);
    const val = row.col_0; // Only access one
  });

  bench("Lazy Decoding (Hybrid Target)", () => {
    const row = createLazyRowProxy<any>(largeDataRow, largeFields, protocol);
    const val = row.col_0; // Only access one
  });
});

await run();
