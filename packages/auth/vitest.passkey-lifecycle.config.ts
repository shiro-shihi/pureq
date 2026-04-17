import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@pureq/pureq": resolve(__dirname, "../pureq/src/index.ts"),
      "@pureq/pureq/*": resolve(__dirname, "../pureq/src/*"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/passkey-provider.test.ts", "tests/core-auth-handlers.test.ts"],
    coverage: {
      enabled: true,
      provider: "v8",
      include: ["src/providers/index.ts"],
      reporter: ["text", "json-summary"],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
