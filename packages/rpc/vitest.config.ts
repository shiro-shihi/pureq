import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    alias: {
      "@pureq/db": path.resolve(__dirname, "../db/src/index.ts"),
      "@pureq/validation": path.resolve(__dirname, "../validation/src/index.ts"),
      "@pureq/connectivity": path.resolve(__dirname, "../connectivity/src/index.ts")
    }
  }
});
