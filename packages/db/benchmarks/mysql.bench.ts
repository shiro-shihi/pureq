import { run, bench, group } from "mitata";
import { MysqlProtocol, MYSQL_TYPES } from "../src/protocol/mysql-wire.js";
import { createMysqlLazyRowProxy } from "../src/drivers/native/mysql/lazy-row.js";

/**
 * MYSQL NATIVE PERFORMANCE BENCHMARK (Fixed for Dead Code Elimination)
 */

const protocol = new MysqlProtocol();

// Case A: Small row (3 columns)
const smallFields = [
  { name: "id", type: MYSQL_TYPES.LONG, flags: 0, decimals: 0, charset: 63 },
  { name: "name", type: MYSQL_TYPES.VAR_STRING, flags: 0, decimals: 0, charset: 33 },
  { name: "status", type: MYSQL_TYPES.TINY, flags: 0, decimals: 0, charset: 63 }
];
const smallDataRow = new Uint8Array([
  0x00, 0x00, 123, 0, 0, 0, 5, 65, 108, 105, 99, 101, 1
]);

// Case B: Large row (20 columns)
const largeFields = Array.from({ length: 20 }).map((_, i) => ({
  name: `col_${i}`, type: MYSQL_TYPES.VAR_STRING, flags: 0, decimals: 0, charset: 33
}));
const largeDataRowParts = [0x00, 0x00, 0x00, 0x00];
for (let i = 0; i < 20; i++) {
  largeDataRowParts.push(4, 100, 101, 102, 103);
}
const largeDataRow = new Uint8Array(largeDataRowParts);

// Simulate the driver's eager parser
function eagerParse(rawData: Uint8Array, fields: any[]): any {
    const view = new DataView(rawData.buffer, rawData.byteOffset, rawData.length);
    const nullBitmapLength = Math.floor((fields.length + 7 + 2) / 8);
    let current = 1 + nullBitmapLength;
    const row: any = {};
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i]!;
      if (field.type === MYSQL_TYPES.VAR_STRING) {
        const len = rawData[current]!;
        row[field.name] = new TextDecoder().decode(rawData.slice(current + 1, current + 1 + len));
        current += 1 + len;
      } else {
        row[field.name] = view.getInt32(current, true);
        current += 4;
      }
    }
    return row;
}

group("MySQL Row Decoding - Realistic Access", () => {
  bench("Small Row (3 cols) - Eager", () => {
    const row = eagerParse(smallDataRow, smallFields);
    return row.name; // Return to prevent DCE
  });

  bench("Small Row (3 cols) - Lazy (Proxy)", () => {
    const row = createMysqlLazyRowProxy<any>(smallDataRow, smallFields as any, protocol);
    return row.name;
  });

  bench("Large Row (20 cols) - Eager (Full)", () => {
    const row = eagerParse(largeDataRow, largeFields);
    return row.col_0;
  });

  bench("Large Row (20 cols) - Lazy (Hybrid)", () => {
    const row = createMysqlLazyRowProxy<any>(largeDataRow, largeFields as any, protocol);
    return row.col_0;
  });
});

await run();
