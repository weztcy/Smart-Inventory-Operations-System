import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: "file:./test.db",
      AUTH_SECRET: "test-secret-untuk-vitest-only-0123456789",
    },
    globalSetup: "./tests/global-setup.ts",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
