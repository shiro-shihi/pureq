import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@pureq/pureq": resolve(__dirname, "../pureq/src/index.ts"),
      "@pureq/pureq/*": resolve(__dirname, "../pureq/src/*"),
      "@pureq/db": resolve(__dirname, "../db/src/index.ts"),
      "@pureq/validation": resolve(__dirname, "../validation/src/index.ts"),
    },
  },
  test: {
    environment: "node",
  },
});
