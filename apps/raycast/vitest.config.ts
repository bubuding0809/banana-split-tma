import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@raycast/api": fileURLToPath(new URL("./tests/mocks/raycast-api.ts", import.meta.url)),
    },
  },
});
