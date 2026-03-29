import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: [
      "src/**/__tests__/**/*.test.{ts,tsx}",
      "src/**/*.test.{ts,tsx}",
      "src/**/*.spec.ts",
    ],
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      "@components": new URL("./src/components", import.meta.url).pathname,
      "@utils": new URL("./src/utils", import.meta.url).pathname,
      "@hooks": new URL("./src/hooks", import.meta.url).pathname,
    },
  },
});
