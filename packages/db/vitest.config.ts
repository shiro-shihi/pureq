import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@pureq/validation": resolve(__dirname, "../validation/src/index.ts"),
    },
  },
  test: {
    environment: "node",
  },
});
