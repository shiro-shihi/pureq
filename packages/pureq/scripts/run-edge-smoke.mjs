import { readFile } from "node:fs/promises";
import { EdgeVM } from "@edge-runtime/vm";

const bundlePath = ".tmp/edge-smoke.bundle.js";
const code = await readFile(bundlePath, "utf8");

const vm = new EdgeVM();
vm.evaluate(code);

const result = await vm.evaluate("globalThis.__PUREQ_EDGE_SMOKE__()");

if (!result || result.ok !== true || result.status !== 200) {
  console.error("edge runtime smoke failed:", result);
  process.exitCode = 1;
} else {
  console.log("edge runtime smoke passed");
}
